(function(root){
  'use strict';

  var config;
  var state;
  var locked = false;
  var transitionTimer;
  var bgm;
  var audioContext;
  var audioMaster;

  function byId(id){
    return document.getElementById(id);
  }

  function storageKey(){
    return 'desire-progress:' + config.meta.id;
  }

  function createState(length){
    return {index: 0, answers: new Array(length).fill(null)};
  }

  function loadOrCreateState(length){
    var saved;
    try {
      saved = JSON.parse(localStorage.getItem(storageKey()));
    } catch (error) {
      saved = null;
    }
    if(!saved || !Array.isArray(saved.answers) || saved.answers.length !== length){
      return createState(length);
    }
    saved.index = Math.max(0, Math.min(Number(saved.index) || 0, length - 1));
    saved.answers = saved.answers.map(function(value, questionIndex){
      var options = config.questions[questionIndex].options;
      return Number.isInteger(value) && value >= 0 && value < options.length ? value : null;
    });
    return saved;
  }

  function save(){
    try {
      localStorage.setItem(storageKey(), JSON.stringify(state));
    } catch (error) {
      return;
    }
  }

  function announce(message){
    byId('live-status').textContent = message;
  }

  function showScreen(id){
    ['screen-cover', 'screen-intro', 'screen-quiz', 'screen-result'].forEach(function(screenId){
      byId(screenId).hidden = screenId !== id;
    });
  }

  function initHeroMedia(mediaConfig){
    var mediaRoot = byId('hero-media');
    var poster = byId('hero-poster');
    var video = byId('hero-video');
    var canReveal = true;
    var connection = root.navigator && root.navigator.connection;

    mediaRoot.classList.remove('is-ready');
    poster.src = mediaConfig.poster;
    video.onloadeddata = null;
    video.onerror = null;
    video.onstalled = null;
    video.removeAttribute('src');

    if(connection && connection.saveData){
      if(typeof video.load === 'function') video.load();
      return;
    }

    function showPoster(){
      canReveal = false;
      mediaRoot.classList.remove('is-ready');
    }

    video.onerror = showPoster;
    video.onstalled = showPoster;
    video.onloadeddata = function(){
      var playPromise;
      if(!canReveal) return;
      try {
        playPromise = video.play();
      } catch (error) {
        showPoster();
        return;
      }
      if(!playPromise || typeof playPromise.then !== 'function') return;
      playPromise.then(function(){
        if(canReveal) mediaRoot.classList.add('is-ready');
      }, showPoster);
    };
    video.src = mediaConfig.heroVideo;
  }

  function audioIsEnabled(){
    return !config.audio || config.audio.enabled !== false;
  }

  function initAudio(){
    var audio;

    if(!audioIsEnabled()) return null;
    audio = byId('bgm');
    if(!audio) return null;
    bgm = audio;
    bgm.loop = true;
    bgm.preload = 'metadata';
    bgm.volume = config.audio && config.audio.musicVolume || 0.3;
    bgm.src = config.audio && config.audio.music || '';
    return bgm;
  }

  function getAudioContext(){
    var AudioContextCtor;

    if(audioContext) return audioContext;
    AudioContextCtor = root.AudioContext || root.webkitAudioContext;
    if(!AudioContextCtor) return null;

    try {
      audioContext = new AudioContextCtor();
      audioMaster = audioContext.createGain();
      audioMaster.gain.value = config.audio && config.audio.sfxVolume || 0.16;
      audioMaster.connect(audioContext.destination);
    } catch (error) {
      audioContext = null;
      audioMaster = null;
    }
    return audioContext;
  }

  function ensureAudio(){
    var context;

    if(!audioIsEnabled()) return null;
    context = getAudioContext();
    if(!context) return null;
    if(context.state === 'suspended' && typeof context.resume === 'function'){
      try { context.resume(); } catch (error) {}
    }
    return context;
  }

  function playTone(frequency, duration, volume, type, when){
    var context = ensureAudio();
    var oscillator;
    var gain;
    var start;

    if(!context || !audioMaster) return;
    start = when || context.currentTime;
    try {
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = type || 'sine';
      oscillator.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(volume, start + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      oscillator.connect(gain);
      gain.connect(audioMaster);
      oscillator.start(start);
      oscillator.stop(start + duration + 0.04);
    } catch (error) {}
  }

  function startAudio(){
    var audio;
    var playPromise;

    if(!audioIsEnabled()) return;
    audio = initAudio();
    ensureAudio();
    if(!audio || !audio.paused || typeof audio.play !== 'function') return;
    try {
      playPromise = audio.play();
      if(playPromise && typeof playPromise.catch === 'function') playPromise.catch(function(){});
    } catch (error) {}
  }

  function playClick(){
    var context;

    context = ensureAudio();
    if(!context) return;
    playTone(180, 0.08, 0.06, 'triangle', context.currentTime);
    playTone(1200, 0.025, 0.035, 'square', context.currentTime);
    playTone(95, 0.1, 0.03, 'sine', context.currentTime + 0.008);
  }

  function renderCover(){
    document.documentElement.style.setProperty('--accent', config.theme.accent);
    document.documentElement.style.setProperty('--hero-object-position', config.theme.heroObjectPosition || '50% 20%');
    document.title = config.meta.title;
    byId('cover-brand').textContent = config.meta.brand;
    byId('cover-title').textContent = config.meta.title;
    byId('cover-eyebrow').textContent = config.intro.eyebrow;
    showScreen('screen-cover');
    byId('cover-title').focus();
  }

  function renderIntro(){
    byId('intro-disclaimer').textContent = config.intro.disclaimer;
    document.querySelector('[data-action="start-quiz"]').textContent = config.intro.cta;
    showScreen('screen-intro');
    byId('intro-title').focus();
  }

  function renderQuestion(){
    var question = config.questions[state.index];
    var selected = state.answers[state.index];
    var optionRoot = byId('question-options');

    byId('question-count').textContent = '第 ' + (state.index + 1) + ' 题 / 共 ' + config.questions.length + ' 题';
    byId('question-progress').max = config.questions.length;
    byId('question-progress').value = state.index + 1;
    byId('question-progress').textContent = Math.round((state.index + 1) / config.questions.length * 100) + '%';
    byId('question-title').textContent = question.text;
    optionRoot.replaceChildren();

    question.options.forEach(function(option, optionIndex){
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'option-button';
      button.dataset.question = String(state.index);
      button.dataset.option = String(optionIndex);
      button.setAttribute('aria-pressed', String(selected === optionIndex));
      button.textContent = option.label;
      optionRoot.appendChild(button);
    });

    document.querySelector('[data-action="previous-question"]').disabled = state.index === 0;
    document.querySelector('[data-action="next-question"]').disabled = selected === null;
    showScreen('screen-quiz');
    announce('第 ' + (state.index + 1) + ' 题，共 ' + config.questions.length + ' 题');
    byId('question-title').focus();
  }

  function resultForId(id){
    return config.results.find(function(result){ return result.id === id; });
  }

  function dimensionForId(id){
    return config.dimensions.find(function(dimension){ return dimension.id === id; });
  }

  function prefersReducedMotion(){
    return !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function sizeCanvas(canvas, cssWidth, cssHeight){
    var ratio = Math.min(root.devicePixelRatio || 1, 2);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssHeight + 'px';
    return ratio;
  }

  function drawRadar(calculation){
    var canvas = byId('result-radar');
    var context = canvas.getContext('2d');
    var dimensions = config.dimensions;
    var width = Math.round(canvas.clientWidth || 300);
    var height = width;
    var ratio = sizeCanvas(canvas, width, height);
    var centerX = width / 2;
    var centerY = height / 2;
    var radius = Math.max(36, Math.min(width, height) / 2 - 54);
    var angleStep = Math.PI * 2 / dimensions.length;

    context.scale(ratio, ratio);
    context.clearRect(0, 0, width, height);
    context.lineWidth = 1;
    context.strokeStyle = 'rgba(236, 229, 216, 0.18)';

    [0.25, 0.5, 0.75, 1].forEach(function(level){
      context.beginPath();
      dimensions.forEach(function(dimension, index){
        var angle = -Math.PI / 2 + angleStep * index;
        var x = centerX + Math.cos(angle) * radius * level;
        var y = centerY + Math.sin(angle) * radius * level;
        if(index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.stroke();
    });

    dimensions.forEach(function(dimension, index){
      var angle = -Math.PI / 2 + angleStep * index;
      context.beginPath();
      context.moveTo(centerX, centerY);
      context.lineTo(centerX + Math.cos(angle) * radius, centerY + Math.sin(angle) * radius);
      context.stroke();
    });

    context.beginPath();
    dimensions.forEach(function(dimension, index){
      var angle = -Math.PI / 2 + angleStep * index;
      var score = calculation.scores[dimension.id];
      var x = centerX + Math.cos(angle) * radius * score / 100;
      var y = centerY + Math.sin(angle) * radius * score / 100;
      if(index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.globalAlpha = 0.22;
    context.fillStyle = dimensionForId(calculation.ranking[0]).color;
    context.fill();
    context.globalAlpha = 1;
    context.strokeStyle = dimensionForId(calculation.ranking[0]).color;
    context.lineWidth = 2;
    context.stroke();

    context.font = '12px sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    dimensions.forEach(function(dimension, index){
      var angle = -Math.PI / 2 + angleStep * index;
      var labelRadius = radius + 30;
      context.fillStyle = dimension.color;
      context.fillText(
        dimension.label + ' ' + calculation.scores[dimension.id],
        centerX + Math.cos(angle) * labelRadius,
        centerY + Math.sin(angle) * labelRadius
      );
    });
  }

  function renderDimensionScores(calculation){
    var rootElement = byId('result-dimensions');
    var animate = !prefersReducedMotion();
    rootElement.replaceChildren();
    config.dimensions.forEach(function(dimension){
      var row = document.createElement('div');
      var label = document.createElement('span');
      var fill = document.createElement('span');
      var score = calculation.scores[dimension.id];
      row.className = 'result-score';
      label.className = 'result-score-label';
      label.textContent = dimension.label + ' ' + score;
      fill.className = 'result-score-fill' + (animate ? ' is-animated' : '');
      fill.style.width = score + '%';
      fill.style.backgroundColor = dimension.color;
      row.appendChild(label);
      row.appendChild(fill);
      rootElement.appendChild(row);
    });
  }

  function buildShareText(result){
    return config.sharing.template
      .replace(/\{resultTitle\}/g, result.title)
      .replace(/\{resultSlogan\}/g, result.slogan);
  }

  function renderResult(calculation){
    var primaryDimension = dimensionForId(calculation.ranking[0]);
    var secondaryDimension = dimensionForId(calculation.ranking[1]);
    var result = resultForId(calculation.primaryResultId);
    byId('result-title').textContent = result.title;
    byId('result-slogan').textContent = result.slogan;
    byId('result-summary').textContent = result.mono;
    byId('result-diagnosis').textContent = result.diag;
    byId('result-detail-one').textContent = result.seyu;
    byId('result-detail-two').textContent = result.mid;
    byId('result-shadow').textContent = result.dark;
    byId('result-advice').textContent = result.advice;
    byId('result-primary').textContent = primaryDimension.label + ' ' + calculation.scores[primaryDimension.id];
    byId('result-secondary').textContent = secondaryDimension ? secondaryDimension.label + ' ' + calculation.scores[secondaryDimension.id] : '';
    byId('result-share-preview').textContent = buildShareText(result);
    renderDimensionScores(calculation);
    showScreen('screen-result');
    drawRadar(calculation);
    announce('测试完成');
    byId('result-title').focus();
  }

  function finish(){
    var firstMissing = state.answers.indexOf(null);
    var calculation;
    if(firstMissing !== -1){
      state.index = firstMissing;
      save();
      renderQuestion();
      announce('请完成全部题目后再查看结果');
      return false;
    }
    calculation = root.DesireCore.calculate(config, state.answers.slice());
    state.result = {
      scores: calculation.scores,
      ranking: calculation.ranking.slice(),
      primaryResultId: calculation.primaryResultId
    };
    save();
    renderResult(state.result);
    return state.result;
  }

  function restart(){
    root.clearTimeout(transitionTimer);
    locked = false;
    state = createState(config.questions.length);
    save();
    renderCover();
  }

  function reportCopy(success){
    announce(success ? '分享文案复制成功' : '分享文案复制失败，请手动复制');
    return success;
  }

  function copyWithTextarea(text){
    var textarea = document.createElement('textarea');
    var copied = false;
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    try {
      textarea.select();
      copied = document.execCommand('copy') === true;
    } catch (error) {
      copied = false;
    } finally {
      textarea.remove();
    }
    return Promise.resolve(reportCopy(copied));
  }

  function copyShareText(){
    var result;
    var text;
    if(!state.result && finish() === false) return Promise.resolve(false);
    result = resultForId(state.result.primaryResultId);
    text = buildShareText(result);
    if(root.isSecureContext && root.navigator && root.navigator.clipboard && typeof root.navigator.clipboard.writeText === 'function'){
      return root.navigator.clipboard.writeText(text).then(function(){
        return reportCopy(true);
      }, function(){
        return reportCopy(false);
      });
    }
    return copyWithTextarea(text);
  }

  function answer(questionIndex, optionIndex){
    if(locked || questionIndex !== state.index) return;
    if(!config.questions[questionIndex].options[optionIndex]) return;

    locked = true;
    state.answers[questionIndex] = optionIndex;
    save();
    renderQuestion();

    transitionTimer = root.setTimeout(function(){
      if(questionIndex === config.questions.length - 1){
        finish();
      } else {
        state.index = Math.min(questionIndex + 1, config.questions.length - 1);
        save();
        renderQuestion();
      }
      locked = false;
    }, 180);
  }

  function previousQuestion(){
    if(locked || state.index === 0) return;
    state.index -= 1;
    save();
    renderQuestion();
  }

  function nextQuestion(){
    if(locked || state.answers[state.index] === null) return;
    if(state.index === config.questions.length - 1){
      finish();
      return;
    }
    state.index += 1;
    save();
    renderQuestion();
  }

  function mount(nextConfig){
    config = nextConfig;
    state = loadOrCreateState(config.questions.length);
    initHeroMedia(config.media);
    initAudio();
    renderCover();
  }

  function remount(nextConfig){
    root.clearTimeout(transitionTimer);
    locked = false;
    config = nextConfig;
    state = createState(config.questions.length);
    initHeroMedia(config.media);
    initAudio();
    renderCover();
  }

  document.addEventListener('click', function(event){
    var option = event.target.closest('[data-question][data-option]');
    var action = event.target.closest('[data-action]');

    if(option){
      playClick();
      answer(Number(option.dataset.question), Number(option.dataset.option));
      return;
    }
    if(!action) return;

    playClick();

    if(action.dataset.action === 'open-intro') renderIntro();
    if(action.dataset.action === 'back-cover') renderCover();
    if(action.dataset.action === 'start-quiz'){
      if(state.answers.every(function(value){ return value !== null; })) finish();
      else renderQuestion();
    }
    if(action.dataset.action === 'previous-question') previousQuestion();
    if(action.dataset.action === 'next-question') nextQuestion();
    if(action.dataset.action === 'copy-share') copyShareText();
    if(action.dataset.action === 'restart') restart();
  });

  document.addEventListener('pointerdown', startAudio);
  document.addEventListener('keydown', startAudio);

  root.DesireApp = {
    mount: mount,
    remount: remount,
    answer: answer,
    finish: finish,
    restart: restart,
    copyShareText: copyShareText,
    initHeroMedia: initHeroMedia,
    startAudio: startAudio
  };
  if(root.PRODUCT_CONFIG) root.DesireApp.mount(root.PRODUCT_CONFIG);
})(window);
