// ==UserScript==
// @name        Quizlet Gravity Timed Study FORCED SPEAK for Chrome
// @namespace   https://github.com/Brandon-Beck
// @version     0.1
// @description Play for 5 minutes, every correct answer removes an additional second, incorrect answers add 2 seconds, missing an answer adds 5 seconds, dying on level 2 adds 5 minutes, every levelup above level 5 removes 1 minute. Sitting at the missed answer prompt adds 0.2 seconds per second, until you type the answer displayed. Pausing adds 2 seconds.
// @author      Brandon Beck
// @include     /^https:\/\/quizlet\.com\/\d+\/gravity\/starred/
// @include     /^https:\/\/quizlet\.com\/\d+\/gravity/
// @grant       GM_setValue
// @grant       GM_getValue
// @license     MIT
// ==/UserScript==
// NOTE This is not supported by Firefox, only webkit enabled browsers such as chrome.
// NOTE Requires microphone permissions. Start gravity. A button to enable microphone access will be on the right side of the address bar
// NOTE Requires a microphone

'use strict'

/*
Ever told your child to studdy on quizlet for 5 minutes, and found that they just stare at the screen with a dumbfounded look on their face
for 5 minutes like their in timeout? Lets stop that.
Ever gone out to garden and came back in 2 hours latter, to see your poor diligent child still studdying with tears in their eyes since its
dark now and they can no longer play with their friends outside....
oops, should have set a timer...


This was written to help children learning their math facts. It gives a timed study enviorment so they know when their done,
while additionaly rewarding them for their work by removing time for correct answers. It demotes spamming answers/numbers by adding time for wrong answers (can't cheat out of division now).
This should additionaly make them pay more attention to the quesion/answer since they dont want more time added.

An additional 5 minutes is added when they die on level 2. Level 2 is the first level you can die on, and it means you missed a question on level one,
and then didn't bother to memorize the answer for even ~20 seconds. Assuming you only are giving them 10 questions or less, they may not be trying, else,
they realy need to studdy.

I recommend using this in the begaining (when they havn't quite memorized anything yet) with 10 questions or less. Just star 10 of them and have them do those
over and over untill they always get them correct (quizlet catagorize them as put a +7 never missed). As they memorize them, unstar the ones they know (the +7 ones)
and put stars on different questions they have yet to memorize.

Once all questions have a +7 by them (or at least a +5), test them over all of them together to reinfore their knowledge.

Was last used to help a child with multiplication/division facts for all numbers between 0 and 12.
*/


const MAX_TIME_REMAINING = 30 * 60
const DEFAULT_TIME_REMAINING = 10 * 60
/* Studies sugest one should study for 15-25 minutes at a time, with at least a 5 minute break inbetween studies.\
this has dual purpose.
1. People loose focuse as time moves on, and best remember the first things they studdied when they were most focused,
and the last thing they studdied when they were eagerly moving twords their break.
2. The break also gives time for you breain to process what was learned, and absorb it. continously throwing new
information at it without a break will lead to lots of data loss. durring the break you consously and subcosously go over what you just learned.
*/

// How long we should allow someone to studdy without breaks before we force them to
// take one.
const MAX_ALLOWED_CONTINUOUS_STUDY_MINUTES = 18
// minimum amount of time one should take a break for.
const REQUIRED_BREAK_MINUTES = 8
const TIME_REMAINING = GM_getValue('quizlet_gravity' ,DEFAULT_TIME_REMAINING)
// used to ensure breakes are taken
let MINUTES_STUDDIED = JSON.parse(GM_getValue('quizlet_studdied_minutes' ,'[]'))

const PAUSE_DETURRENT_TIME = 5
const WRONG_ANSWER_PUNISHMENT_TIME = 10
const MISSED_QUESTION_PUNISHMENT_TIME = 30
const MISS_TICK_PUNISHMENT_TIME = 0.26
const DEATH_PUNISHMENT_LEVEL = 3
const DEATH_PUNISHMENT_TIME = 60 * 3
const CORRECT_ANSWER_REWARD_TIME = 1
const BONUS_LEVEL = 5
const BONUS_TIME = 60 * 1
const break_over_sound = 'https://freesound.org/data/previews/250/250629_4486188-lq.mp3'
const SpeechRecognition = webkitSpeechRecognition || SpeechRecognition
const recognition = new SpeechRecognition()
let isRecognizing = false
let shouldRetryRecognition = false
let recognitionTimer
let shouldDisableCopyInput = false
let recognitionStartTime = 0
const recognitionMaxTime = 10000
let recognizedLast
// /////////////////////////////////////////////////////////////////////
// End Common vaiables
// /////////////////////////////////////////////////////////////////////


let countdown_html = '<div class="GravityModeControls-stat"><span class="GravityModeControls-label"><h6 class="UIHeading UIHeading--six"><span>Time</span></h6></span><span id="time_countdown" class="GravityModeControls-value">0</span></div>'
const dom_container = document.createElement('template')
dom_container.innerHTML = countdown_html
countdown_html = dom_container.content.firstChild

let break_html = '<div class="GravityModeControls-stat"><span class="GravityModeControls-label"><h6 class="UIHeading UIHeading--six"><span id="break_countdown_title">Break</span></h6></span><span id="break_countdown" class="GravityModeControls-value">0</span></div>'
const dom_container2 = document.createElement('template')
dom_container2.innerHTML = break_html
break_html = dom_container2.content.firstChild


let time_remaining = 0
let countdown_elm
let break_elm
let break_title_elm
let restart_btn
let ticky_timer
let pause_play_btn
let pause_play_btn_txtcontainer

// ENUMS
const PLAYING = 0
const PAUSED = 1
const PAUSED_MISSED = 2
const PAUSED_DEAD = 3
const PAUSED_UNKNOWN = 4
const PAUSED_BREAK = 5
const PAUSED_UNBREAK = 6
let last_state = PLAYING
let last_level = 1
let last_score = 0
let last_color_time = 0
const TICK_SPEED = 100
let CUR_TICK = 0
let CUR_TIME = 0
let answers_entered = 0
let last_enter_tick = 0
let last_enter_time = 0
const last_checked_score = 0
const player = new Audio(break_over_sound)
function from_seconds(s) {
  return s / (TICK_SPEED / 10)
}
function seconds_to_ticks(s) {
  // return s * (TICK_SPEED*10);
  return 5
}
function ticks_to_seconds(s) {
  return s / (TICK_SPEED / 10)
}
(() => {
  'use strict'

  function play_sound(sound) {
    player.play()
  }
  function pause_sound(sound) {
    player.pause()
  }
  function RecurringTimer(callback ,delay) {
    let timerId; let start; let remaining = delay

    this.pause = function () {
      window.clearTimeout(timerId)
      remaining -= new Date() - start
    }
    const resume = function () {
      start = new Date()
      timerId = window.setTimeout(() => {
        remaining = delay
        resume()
        callback()
      } ,remaining)
    }
    this.resume = resume

    this.resume()
  }
  // Your code here...
  function lookupElementByXPath(path) {
    const evaluator = new XPathEvaluator()
    const result = evaluator.evaluate(path ,document.documentElement ,null ,XPathResult.FIRST_ORDERED_NODE_TYPE ,null)
    return result.singleNodeValue
  }
  function insert_html() {
    const progress_column = lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"ModeControls-progressSection")]/div')
    progress_column.appendChild(countdown_html)
    progress_column.appendChild(break_html)
  }
  function capture_input() {
    const input_elm = '//*[@id="GravityModeTarget"]//div[contains(@class,"GravityTypingPrompt")]//textarea'
  }
  function get_cur_score() {
    let score = 0
    // var level_elm=lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"GravityModeControls-stat") and ./span[contains(text(),"Score") and contains(@class,"GravityModeControls-label")]]/span[contains(@class,"GravityModeControls-value")]');
    const score_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"GravityModeControls-stat") and .//span[contains(text(),"Score")]]/span[contains(@class,"GravityModeControls-value")]')
    score = score_elm.textContent
    score = parseFloat(score.replace(/,/g ,''))
    return score
  }
  function get_cur_level() {
    let level = 0
    // var level_elm=lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"GravityModeControls-stat") and ./span[contains(text(),"Level") and contains(@class,"GravityModeControls-label")]]/span[contains(@class,"GravityModeControls-value")]');
    const level_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"GravityModeControls-stat") and .//span[contains(text(),"Level")]]/span[contains(@class,"GravityModeControls-value")]')
    level = level_elm.textContent
    return level
  }
  function get_is_dead() {
    let is_dead = false
    const dead_elm = lookupElementByXPath('//div[contains(@class,"UIDiv HighscoresMessage-button")]//span[contains(text(),"Play again")]')
    if (dead_elm) {
      is_dead = true
    }
    return is_dead
  }
  function get_dialog_status() {
    const dailog_elm = lookupElementByXPath('//div[contains(@class,"UIModal-backdrop is-visible")]')
    const start_dia_backdrop_elm = lookupElementByXPath('//div[contains(@class,"GravityStartView-backdrop")]')

    if (dailog_elm || start_dia_backdrop_elm) {
      return true
    }

    return false
  }
  function get_game_state() {
    if (get_is_dead() == true) {
      return PAUSED_DEAD
    }
    if (pause_play_btn.disabled == true) {
      return PAUSED_MISSED
    }
    if (get_dialog_status() == true) {
      return PAUSED_UNKNOWN
    }
    if (pause_play_btn_txtcontainer.innerHTML.indexOf('Pause') != -1) {
      return PLAYING
    }
    return PAUSED
  }
  function get_timer_state() {
    // FIXME this does NOT belong here
    const gstate = get_game_state()
    let ret = PAUSED
    if (has_overstuddied()) {
      ret = PAUSED_BREAK
    }
    // To only consider us unpaused after the first answer is given. Not needed if we actualy pause the game ourselves
    // else if ((last_state == PAUSED_BREAK || last_state == PAUSED_UNBREAK ) && (gstate != PLAYING || last_score == get_cur_score()) ) {
    else if ((last_state == PAUSED_BREAK || last_state == PAUSED_UNBREAK) && gstate != PLAYING) {
      ret = PAUSED_UNBREAK
    }
    else {
      ret = gstate
    }
    return ret
  }
  function is_playing() {
    return get_game_state() == PLAYING
  }
  function is_not_paused() {
    if (pause_play_btn.disabled == true) {
      return false
    }
    if (pause_play_btn_txtcontainer.innerHTML.indexOf('Pause') != -1) {
      return true
    }
    return false
  }
  function set_pause(b) {
    if (b && is_not_paused()) {
      pause_play_btn.click()
    }
    if (!b && !is_not_paused()) {
      pause_play_btn.click()
    }
    return false
  }
  function get_cur_minute() {
    return Math.floor((new Date()).getTime() / (1000 * 60))
  }
  function FIXME_CLEAR_ALL_MINUTES_BC_STUDY_TIME_CALC_IS_BROKEN() {
    MINUTES_STUDDIED = []
    GM_setValue('quizlet_studdied_minutes' ,JSON.stringify(MINUTES_STUDDIED))
  }
  // FIXME Sttudied time calculator functions need lots of love
  function add_studdied_minutes() {
    const cur_minute = get_cur_minute()
    if (cur_minute != MINUTES_STUDDIED[MINUTES_STUDDIED.length - 1]) {
      console.log(cur_minute)
      MINUTES_STUDDIED.push(cur_minute)
      GM_setValue('quizlet_studdied_minutes' ,JSON.stringify(MINUTES_STUDDIED))
    }
    if (MINUTES_STUDDIED.length > MAX_ALLOWED_CONTINUOUS_STUDY_MINUTES + REQUIRED_BREAK_MINUTES) {
      MINUTES_STUDDIED.shift()
      console.log(MINUTES_STUDDIED.toString())
    }
  }

  function get_last_studdied_minute() {
    return MINUTES_STUDDIED[MINUTES_STUDDIED.length - 1]
  }
  function get_studdied_time() {
    let studdied_time = 0
    let prev_min = 0
    for (let min_i = 0; min_i < MINUTES_STUDDIED.length; min_i++) {
      const min = MINUTES_STUDDIED[min_i]
      // ensure we havnt already taken a break
      // console.log('CHECKING MIN ' + min + ' total ' + studdied_time );
      if (min > prev_min + REQUIRED_BREAK_MINUTES) {
        // console.log('RESET TO 0');
        studdied_time = 1
      }
      else if (min > get_cur_minute() - (MAX_ALLOWED_CONTINUOUS_STUDY_MINUTES + REQUIRED_BREAK_MINUTES)) {
        studdied_time++
        // console.log('ADDED TIME ' + studdied_time );
      }
      prev_min = min
    }
    if (get_cur_minute() > prev_min + REQUIRED_BREAK_MINUTES) {
      studdied_time = 0
    }
    // console.log('ENDED WITH ' + studdied_time );
    return studdied_time
  }
  function has_overstuddied() {
    if (get_studdied_time() >= MAX_ALLOWED_CONTINUOUS_STUDY_MINUTES) {
      return true
    }
    return false
  }
  function get_break_time_remaining() {
    if (has_overstuddied()) {
      return REQUIRED_BREAK_MINUTES - (get_cur_minute() - get_last_studdied_minute())
    }
    return 0
  }
  function get_next_break() {
    if (!has_overstuddied()) {
      return MAX_ALLOWED_CONTINUOUS_STUDY_MINUTES - get_studdied_time()
    }
    return 0
  }
  function required_studdy_break() {
    // aaaaaaaaaaaaaaaa
  }
  function on_key_press(e) {
    const keycode = (e.keyCode ? e.keyCode : e.which)
    if (keycode == '13') {
      // alert('meeee');
      on_value_entered()
    }
  }
  function on_value_entered() {
    if (is_playing()) {
      answers_entered += 1
      last_enter_tick = CUR_TICK
      last_enter_time = CUR_TIME
    }
  }
  function set_timer(seconds) {
    time_remaining = seconds
    if (time_remaining <= 0) {
      time_remaining = 0
      restart_btn.style.display = 'inline-flex'
    }
    else if (time_remaining > DEFAULT_TIME_REMAINING) {
      restart_btn.style.display = 'none'
    }
    else {
      restart_btn.style.display = 'inline-flex'
    }
    if (time_remaining > MAX_TIME_REMAINING) {
      time_remaining = MAX_TIME_REMAINING
    }
    countdown_elm.textContent = Math.round(time_remaining)
    GM_setValue('quizlet_gravity' ,time_remaining)
  }
  function try_set_timer(seconds) {
    if (time_remaining != 0) {
      set_timer(seconds)
    }
  }
  function color_timer(color) {
    countdown_elm.style.color = color
    last_color_time = (new Date()).getTime()
  }
  function alter_timer(seconds) {
    try_set_timer(time_remaining + seconds)
  }
  function check_answer_was_correct() {
    const cur_score = get_cur_score()
    if (cur_score == last_checked_score) {
      onwronganswer()
    }
  }
  function ontick() {
    CUR_TICK += 1
    // var game_state = get_game_state();
    const game_state = get_timer_state()
    const cur_time = (new Date()).getTime()
    CUR_TIME = cur_time
    if (last_color_time + 1000 <= cur_time) {
      color_timer('#455358')
    }

    if (game_state == PLAYING) {
      add_studdied_minutes()
      alter_timer(from_seconds(-1))
    }
    else if (game_state == PAUSED
                 && last_state == PLAYING) {
      onpause()
    }
    else if (game_state == PAUSED_MISSED
                 && last_state != PAUSED_MISSED) {
      // onpause();
      onmiss()
    }
    else if (game_state == PAUSED_MISSED
                 && last_state == PAUSED_MISSED) {
      // onpause();
      onmisstick()
    }
    else if (game_state == PAUSED_DEAD
                && last_state != PAUSED_DEAD) {
      ondie()
    }
    else if (game_state == PAUSED_UNKNOWN) {
      // aaaa
    }
    if (game_state == PAUSED_BREAK) {
      break_title_elm.style.color = 'red'
      break_title_elm.textContent = 'Studdy Break'
      break_elm.textContent = get_break_time_remaining()
      set_pause(true)
      if (last_state != PAUSED_BREAK) {
        setTimeout(() => {
          // alert("Please take a break for the next " + get_break_time_remaining() + " minutes");
          console.log(`Please take a break for the next ${get_break_time_remaining()} minutes`)
        } ,500)
      }
    }
    else if (game_state == PAUSED_UNBREAK) {
      FIXME_CLEAR_ALL_MINUTES_BC_STUDY_TIME_CALC_IS_BROKEN()
      break_title_elm.style.color = 'green'
      break_title_elm.textContent = 'Waiting For Player'
      play_sound(break_over_sound)
      break_elm.textContent = get_break_time_remaining()
    }
    else {
      break_title_elm.style.color = '#455358'
      break_title_elm.textContent = 'Next Break'
      pause_sound(break_over_sound)
      break_elm.textContent = get_next_break()
    }
    last_state = game_state
    const cur_level = get_cur_level()
    if (last_level < cur_level) {
      onlevelup()
    }
    last_level = cur_level
    const cur_score = get_cur_score()
    if (cur_score > last_score) {
      oncorrect()
    }
    else if (cur_score < last_score) {
      onwronganswer()
    }
    // if (last_enter_time >= CUR_TIME - 200 ) {}
    // if (last_enter_tick == CUR_TICK - 5 ) {
    //    check_answer_was_correct();
    // }
    last_score = cur_score
  }
  function PrependZeros(s ,digits) {
    return ('0'.repeat(digits) + s).slice(-digits)
  }
  function onmiss() {
    // alter_timer(+2);
    // if get_cur_level() < SOMETHING {
    //     alter_timer(+MISSED_QUESTION_PUNISHMENT_TIME);
    // }
    // else {
    // }
    const copy_input_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//textarea[contains(@class,"GravityCopyTermView-input")]')
    copy_input_elm.disabled = true
    copy_input_elm.value = ''
    copy_input_elm.placeholder = `${PrependZeros(recognitionMaxTime ,2)}: SAY IT ALOUD`
    shouldDisableCopyInput = true
    shouldRetryRecognition = true
    let punishment_factor = (BONUS_LEVEL / get_cur_level())
    if (punishment_factor > 1) {
      punishment_factor = 1
    }
    else if (punishment_factor < 0) {
      punishment_factor = 0
    }
    const punishment = MISSED_QUESTION_PUNISHMENT_TIME * punishment_factor
    if (punishment > 0) {
      alter_timer(punishment)
    }
    recognition.start()
  }
  let missed_question_elm
  let copy_answer_elm
  function onSayWrongAnswer(orig) {
    recognition.stop()
    let s = orig.toLowerCase()
    s = s.replace(/times|x|×/g ,'*')
    s = s.replace(/divided by/g ,'/')
    s = s.replace(/equals|is/g ,'=')
    s = s.replace(/to|too|two/g ,'2')
    s = s.replace(/one/g ,'1')
    s = s.replace(/three/g ,'3')
    s = s.replace(/four|for/g ,'4')
    s = s.replace(/five/g ,'5')
    s = s.replace(/six|sex/g ,'6')
    s = s.replace(/seven/g ,'7')
    s = s.replace(/eight|ate/g ,'8')
    s = s.replace(/nine/g ,'9')
    s = s.replace(/ten|tin/g ,'10')
    s = s.replace(/[.,!? ]/g ,'')
    const missed_question_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"GravityCopyTermView-definitionText")]')
    const copy_answer_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//div[contains(@class,"GravityCopyTermView-word")]')
    let q = missed_question_elm.textContent
    const a = copy_answer_elm.textContent
    q = q.replace(/x|X|×/g ,'*')
    const qa = `${q}=${a}`
    const copy_input_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//textarea[contains(@class,"GravityCopyTermView-input")]')
    copy_input_elm.placeholder = s
    if (s == qa) {
      console.log(`Spoken reply '${s}' matches QA '${qa}'`)
      recognizedLast = null
      copy_input_elm.disabled = false
      shouldDisableCopyInput = false
      shouldRetryRecognition = false
      copy_input_elm.focus()
    }
    else {
      console.log(`Spoken replay '${s}' does NOT match QA '${qa}'`)
      shouldRetryRecognition = true
      recognizedLast = s
    }
  }
  function onmisstick() {
    // alter_timer(+2);
    const copy_input_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//textarea[contains(@class,"GravityCopyTermView-input")]')
    const remaining_time = Math.max(0 ,Math.floor(((recognitionStartTime / 1000) + recognitionMaxTime) - (CUR_TIME / 1000) + 0.5))
    const zeros = PrependZeros(remaining_time ,2)
    let reply = `${zeros}: SAY IT ALOUD`
    if (!shouldRetryRecognition) {
      reply = 'CORRECT! Now type it:'
    }
    else if (recognizedLast != null) {
      reply = `${zeros}: Wrong Reply ${recognizedLast}`
    }
    copy_input_elm.placeholder = reply
    alter_timer(from_seconds(MISS_TICK_PUNISHMENT_TIME))
  }
  function onwronganswer() {
    alter_timer(+WRONG_ANSWER_PUNISHMENT_TIME)
    color_timer('red')
  }
  function oncorrect() {
    alter_timer(-CORRECT_ANSWER_REWARD_TIME)
    color_timer('green')
  }
  function ondie() {
    if (get_cur_level() <= DEATH_PUNISHMENT_LEVEL) {
      alter_timer(+DEATH_PUNISHMENT_TIME)
    }
  }
  function onlevelup() {
    const level_bonus = get_cur_level() - (BONUS_LEVEL - 1)
    if (level_bonus > 0) {
      // alter_timer(-level_bonus*60);
      alter_timer(-BONUS_TIME)
      color_timer('green')
    }
  }
  function onpause() {
    alter_timer(+PAUSE_DETURRENT_TIME)
  }
  function onplay() {
    ticky_timer.resume()
  }
  function run() {
    const get_started_btn = lookupElementByXPath('//*[@id="GravityModeTarget"]/div/div/div/div[2]/div[2]/div[2]/button')
    pause_play_btn = lookupElementByXPath('//*[@id="GravityModeTarget"]//button[//span[contains(text(),"Pause")]]')
    pause_play_btn_txtcontainer = lookupElementByXPath('//*[@id="GravityModeTarget"]//button//span[contains(text(),"Pause")]')

    restart_btn = lookupElementByXPath('//*[@id="GravityModeTarget"]//button[.//span[contains(text(),"Restart")]]')
    const old_on_click_restart = restart_btn.onclick
    restart_btn.onclick = function () {
      set_timer(DEFAULT_TIME_REMAINING)
      FIXME_CLEAR_ALL_MINUTES_BC_STUDY_TIME_CALC_IS_BROKEN()
      old_on_click_restart()
    }
    restart_btn.style.display = 'none'
    insert_html()
    countdown_elm = lookupElementByXPath('//*[@id="time_countdown"]')
    break_elm = lookupElementByXPath('//*[@id="break_countdown"]')
    break_title_elm = lookupElementByXPath('//*[@id="break_countdown_title"]')
    get_started_btn.click()
    set_timer(TIME_REMAINING)
    ticky_timer = new RecurringTimer(ontick ,TICK_SPEED)
    // document.body.onkeyup=on_key_press;
    setTimeout(() => {
      const hard_btn = lookupElementByXPath('//input[@name="difficultyLevel" and @value="EXPERT"]')
      const start_btn = lookupElementByXPath('//*[contains(@class,"GravityOptionsView-nextButtonWrapper")]/button')
      hard_btn.click()
      start_btn.click()
    } ,1000)
    recognition.onstart = function () {
      shouldRetryRecognition = true
      recognitionStartTime = CUR_TIME
      isRecognizing = true
      console.log('Listening')
      clearTimeout(recognitionTimer)
      recognitionTimer = setTimeout(() => {
        console.log('And closing ears')
        recognition.stop()
      } ,recognitionMaxTime)
    }
    recognition.onend = function () {
      isRecognizing = false
      const copy_input_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//textarea[contains(@class,"GravityCopyTermView-input")]')
      if (shouldRetryRecognition) {
        copy_input_elm.placeholder = 'Retrying Recognition, Please Wait'
        console.log('retrying recognition')
        recognition.start()
      }
      else {
        clearTimeout(recognitionTimer)
        copy_input_elm.placeholder = 'Correct! Now type it:'
        console.log('Recognition Successfull')
      }
    }
    recognition.onresult = function (event) {
      const s = event.results[0][0].transcript
      onSayWrongAnswer(s)
    }
    recognition.onerror = function (event) {
      const copy_input_elm = lookupElementByXPath('//*[@id="GravityModeTarget"]//textarea[contains(@class,"GravityCopyTermView-input")]')
      copy_input_elm.placeholder = `Recognition Error, Please Wait: ${event.error}`
      console.log(`Recognition Error, retrying: ${event.error}`)
      isRecognizing = false
    }
  }
  setTimeout(run ,2000)
})()
