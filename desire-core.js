(function(root, factory){
  var api = factory();
  if(typeof module === 'object' && module.exports) module.exports = api;
  root.DesireCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  // A complete config includes meta.id, dimensions, questions and results.
  function validateConfig(config){
    if(!config || typeof config !== 'object' || Array.isArray(config)) return ['config must be an object'];
    var safeIdPattern = /^[a-z0-9][a-z0-9-]{1,63}$/;
    var errors = [], ids = Object.create(null), resultDimensions = Object.create(null);
    if(!config.meta || !safeIdPattern.test(config.meta.id || '')) errors.push('invalid product id');
    if(!config.dimensions || !config.dimensions.length) errors.push('at least one dimension is required');
    if(!config.questions || !config.questions.length) errors.push('at least one question is required');
    if(!config.results || !config.results.length) errors.push('at least one result is required');
    (config.dimensions || []).forEach(function(d){
      var id = d && d.id;
      if(typeof id !== 'string' || !safeIdPattern.test(id)) errors.push('invalid dimension id '+(id || '(missing id)'));
      if(ids[id]) errors.push('duplicate dimension id '+id);
      ids[id] = true;
    });
    (config.questions || []).forEach(function(q, qi){
      if(!q.id || !q.text) errors.push('questions['+qi+'] requires id and text');
      if(!q.options || q.options.length < 2) errors.push('questions['+qi+'] requires at least two options');
      (q.options || []).forEach(function(o, oi){
        Object.keys(o.weights || {}).forEach(function(id){
          if(!ids[id]) errors.push('questions['+qi+'].options['+oi+'] references unknown dimension '+id);
          if(!Number.isFinite(Number(o.weights[id]))) errors.push('questions['+qi+'].options['+oi+'] has non-numeric weight '+id);
        });
      });
    });
    (config.results || []).forEach(function(r){
      if(!ids[r.dimensionId]) errors.push('result '+(r.id||'(missing id)')+' references unknown dimension '+r.dimensionId);
      resultDimensions[r.dimensionId] = true;
    });
    Object.keys(ids).forEach(function(id){ if(!resultDimensions[id]) errors.push('result missing for dimension '+id); });
    return errors;
  }

  function calculate(config, answers){
    var totals = {}, mins = {}, maxes = {};
    config.dimensions.forEach(function(d){ totals[d.id]=0; mins[d.id]=0; maxes[d.id]=0; });
    config.questions.forEach(function(q, qi){
      var selected = q.options[answers[qi]];
      config.dimensions.forEach(function(d){
        var values = q.options.map(function(o){ return Number((o.weights||{})[d.id] || 0); });
        totals[d.id] += Number((selected.weights||{})[d.id] || 0);
        mins[d.id] += Math.min.apply(Math, values);
        maxes[d.id] += Math.max.apply(Math, values);
      });
    });
    var scores = {};
    Object.keys(totals).forEach(function(id){
      var span = maxes[id]-mins[id];
      scores[id] = span ? Math.round((totals[id]-mins[id])/span*100) : 0;
    });
    var ranking = Object.keys(scores).sort(function(a,b){ return scores[b]-scores[a] || (a < b ? -1 : a > b ? 1 : 0); });
    var hit = config.results.find(function(r){ return r.dimensionId === ranking[0]; });
    return {scores:scores, ranking:ranking, primaryResultId:hit && hit.id};
  }
  return {calculate:calculate, validateConfig:validateConfig};
});
