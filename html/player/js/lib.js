if (localStorage.confighistorical == undefined)
{
    localStorage.confighistorical = false;
}

if (localStorage.configcompilations == undefined)
{
    localStorage.configcompilations = false;
}

if (localStorage.smartradio == undefined)
{
    localStorage.smartradio = false;
}

if (localStorage.lastcomposerid == undefined)
{
    localStorage.lastcomposerid = 145;
}

conc_timer = false;
conc_state = {};
conc_playbuffer = {};
conc_favorites = [];
conc_favoritecomposers = [];
conc_forbiddencomposers = [];
conc_favoriteworks = [];
conc_playlists = {};
conc_onair = false;
conc_radioqueue = [];
conc_radiofilter = {};
conc_recoverplayer = {};
conc_disabled = false;

conc_options = {
    historical: JSON.parse(localStorage.confighistorical),
    compilations: JSON.parse(localStorage.configcompilations),
    timeout: 10000,
    backend: 'https://api.' + window.location.hostname,
    opusbackend: 'https://api.openopus.' + (window.location.hostname.split('.')[1] == 'local' ? 'local' : 'org'),
    publicsite: 'https://getconcertino.com',
    shareurl: 'https://conc.' + (window.location.hostname.split('.')[1] == 'local' ? 'local' : 'me'),
    smartradio: JSON.parse(localStorage.smartradio),
    notshow: false,
    spot_redir: 'https://' + window.location.hostname +'/sp/',
    version: '1.19.07.13'
};

window.onpopstate = function (event) {
  if (window.location.pathname != "/") {
    vars = window.location.pathname.split("/");
    if (vars[1] == "u") {
      conc_recording (vars[2], vars[3], vars[4], 1);
    }
    else if (vars[1] == "p") {
      conc_playlistdetail(parseInt(vars[2], 16));
    }
  }
};

// apple music auth

conc_appleauth = function () {

  applemusic = MusicKit.getInstance();

  applemusic.authorize().then(function() {
    $('#loader').fadeOut();
    conc_composersbytag('pop');
    conc_genresbycomposer(localStorage.lastcomposerid, localStorage.lastgenre);
    conc_playlist("fav");
  });
}

conc_toggleplay = function ()
{
  if (Object.keys(conc_state).length > 0)
  {
    spotplayer.togglePlay();
  }
  else
  {
    if (!$('#tuning-modal').is(':visible')) { $('#tuning-modal').leanModal(); }
    conc_spotifyplay(conc_playbuffer.tracksuris, 0);
  }
}

conc_nexttrack = function ()
{
  spotplayer.nextTrack();
}

conc_prevtrack = function ()
{
  spotplayer.previousTrack();
}

conc_pressplaypause = function ()
{
  $(".slider").find('.bar').css('width', '0%');
  $(".timer").html('0:00');

  $('#playpause').removeClass("play");
  $('#playpause').addClass("pause");
}

conc_track = function (offset)
{
  conc_spotifyplay(conc_playbuffer.tracksuris, offset);
}

// player state and timers

conc_playstate = function (state)
{
  var isover = false;

  // treating player shutdown

  if (!state)
  {
    clearInterval(conc_timer);
    $("#timerglobal").html("0:00");
    $("#timer-" + conc_state.id).html("0:00");
    $("#slider-" + conc_state.id).find('.bar').css('width', '0%');
    $("#globalslider-" + conc_state.id).find('.bar').css('width', '0%');
    $('#playpause').removeClass("pause");
    $('#playpause').addClass("play");
    conc_state = {};

    return;
  }

  // treating 'track redirects' -- thanks, spotify!

  if (state.track_window.current_track.linked_from.id)
  {
    state.track_window.current_track.id = state.track_window.current_track.linked_from.id;
  }

  if (state.paused != conc_state.paused)
  {
    // play pause status has changed

    clearInterval (conc_timer);

    if (state.paused)
    {
      $('#playpause').removeClass("pause");
      $('#playpause').addClass("play");

      // is the single-track recording over?

      if (conc_playbuffer.tracks.length == 1 && state.paused && state.track_window.current_track.id == conc_playbuffer.tracks[0] && (state.position == 0 || Math.floor(state.position / 1000) == Math.floor(state.duration / 1000)))
      {
        console.log ('Over, next');
        state.position = 0;
        isover = true;
        conc_radioskip ();
      }
    }
    else
    {
      conc_timer = setInterval (conc_autoslider, 1000);

      $('#playpause').removeClass("play");
      $('#playpause').addClass("pause");
    }
  }

  // has the track changed?

  if (state.track_window.current_track.id != conc_state.id && Object.keys(conc_state).length > 0)
  {
    state.position = 0;

    for (trid in conc_playbuffer.tracks)
    {
      if (conc_playbuffer.tracks[trid] != state.track_window.current_track.id)
      {
        conc_slider ({ changed: true, paused: state.paused, id: conc_playbuffer.tracks[trid], position: 0, duration: 0 });
      }
    }

    if (conc_playbuffer.tracks[0] == state.track_window.current_track.id && state.track_window.next_tracks.length == 0) {
      console.log('Over, next');
      conc_radioskip();
    }
  }
  
  // update current track position

  conc_state = { paused: state.paused, id: state.track_window.current_track.id, position: Math.floor(state.position / 1000), duration: Math.floor(state.duration / 1000) };
  if (conc_state.position > 0 || isover) {
    conc_slider(conc_state);
  }
}

conc_autoslider = function ()
{
  conc_state = { paused: conc_state.paused, id: conc_state.id, position: conc_state.position + 1, duration: conc_state.duration };
  conc_slider (conc_state);
}

conc_slider = function (arg)
{
  if (arg.changed)
  {
    $("#timer-"+arg.id).html("0:00");
    $("#slider-"+arg.id).find('.bar').css('width', '0%');
    $("#globalslider-"+arg.id).find('.bar').css('width', '0%');
  }
  else
  {
    $("#timerglobal").html(conc_readabletime(conc_playbuffer.accdurations[conc_playbuffer.tracks.indexOf(arg.id)] + arg.position));
    $("#timer-"+arg.id).html(conc_readabletime(arg.position));
    $("#slider-"+arg.id).find('.bar').css('width', (100*arg.position/arg.duration) + '%');
    $("#globalslider-"+arg.id).find('.bar').css('width', (100*arg.position/arg.duration) + '%');
  }
}

// slug gen

conc_slug = function (str)
{
  str = str.replace(/^\s+|\s+$/g, ''); // trim
  str = str.toLowerCase();

  // remove accents, swap ñ for n, etc
  var from = "ãàáäâẽèéëêìíïîõòóöôùúüûñç·/_,:;";
  var to   = "aaaaaeeeeeiiiiooooouuuunc------";
  for (var i=0, l=from.length ; i<l ; i++) {
    str = str.replace(new RegExp(from.charAt(i), 'g'), to.charAt(i));
  }

  str = str.replace(/[^a-z0-9 -]/g, '') // remove invalid chars
    .replace(/\s+/g, '-') // collapse whitespace and replace by -
    .replace(/-+/g, '-'); // collapse dashes

  return str;
};

// converting seconds to string

conc_readabletime = function(time)
{
    if (time && time > 0.0)
    {
        var sec = parseInt(time % (60));
        return parseInt(time / (60)) + ':' + (sec < 10 ? '0'+sec : sec);
    }
    else
    {
        return '0:00';
    }
}

// composer list

conc_composersbyname = function (letter)
{
  $.ajax({
    url: conc_options.opusbackend + '/composer/list/name/' + letter + '.json',
    method: "GET",
    success: function (response) {
      conc_composers (response);
    }
  });
}

conc_composersbysearch = function (search)
{
  if (search.length > 3)
  {
    $.ajax({
      url: conc_options.opusbackend + '/composer/list/search/' + search + '.json',
      method: "GET",
      success: function (response) {
        conc_composers(response);
      }
    });
  }
  else if (search.length == 0)
  {
    conc_composersbyname ('all');
  }
}

conc_composersbyepoch = function (epoch)
{
  $.ajax({
    url: conc_options.opusbackend + '/composer/list/epoch/' + epoch + '.json',
    method: "GET",
    success: function (response) {
      conc_composers(response);
    }
  });
}

conc_composersbyfav = function ()
{
  $.ajax({
    url: conc_options.backend + '/user/' + localStorage.spotify_userid + '/composer/fav.json',
    method: "GET",
    success: function (response) {
      conc_composers(response);
    }
  });
}

conc_composersbytag = function (tag) {
  $.ajax({
    url: conc_options.opusbackend + '/composer/list/' + tag + '.json',
    method: "GET",
    success: function (response) {
      conc_composers(response);
    }
  });
}

conc_composers = function (response)
{
  var list = response;

    if (1==1 || list.status.success == "true")
    {
      compcontent = '';

      switch (list.request.type)
      {
        case "epoch":
          compcontent = '<li class="index period">' + list.request.item + '</li>';
          $('#library #composersearch').val('');
          break;

        case "search":
          compcontent = '<li class="index search"></li>';
          $('#library select.periods').val('all');
          $('#library select.periods').trigger('change.select2');
          break;

        case "fav":
          compcontent = '<li class="index favorite">Favorites</li>';
          $('#library #composersearch').val('');
          $('#library select.periods').val('all');
          $('#library select.periods').trigger('change.select2');
          break;

        case "pop":
          compcontent = '<li class="index popular">Popular</li>';
          $('#library #composersearch').val('');
          $('#library select.periods').val('all');
          $('#library select.periods').trigger('change.select2');
          break;

        case "rec":
          compcontent = '<li class="index recommended">Essential</li>';
          $('#library #composersearch').val('');
          $('#library select.periods').val('all');
          $('#library select.periods').trigger('change.select2');
          break;

        case "name":
        default:
          if (list.request.item == "all")
          {
            compcontent = '<li class="index all">All</li>';
          }
          else
          {
            compcontent = '<li class="index">'+list.request.item+'</li>';
          }
          $('#library #composersearch').val('');
          $('#library select.periods').val('all');
          $('#library select.periods').trigger('change.select2');
          break;
      }

      $('#composers').html(compcontent);

      docs = list.composers;
      for (composer in docs)
      {
        if (!docs[composer].death) docs[composer].death = '0000';
        
        if ($.inArray(docs[composer].id.toString(), conc_favoritecomposers) != -1)
        {
          cfav = 'favorite';
        }
        else
        {
          cfav = '';
        }

        if ($.inArray(docs[composer].id.toString(), conc_forbiddencomposers) != -1) 
        {
          cforb = 'forbidden';
        }
        else
        {
          cforb = '';
        }
        
        $('#composers').append('<li class="composer"><ul class="composerdetails"><li class="photo"><a href="javascript:conc_genresbycomposer(\'' + docs[composer].id + '\');"><img src="' + docs[composer].portrait + '" /></a></li><li class="name"><a href="javascript:conc_genresbycomposer(\'' + docs[composer].id + '\');">' + docs[composer].name + '</a></li><li class="fullname">' + docs[composer].complete_name + '</li><li class="dates">(' + docs[composer].birth.substring(0, 4) + (docs[composer].death.substring(0, 4) != '0000' ? '-' + docs[composer].death.substring(0, 4) : '') + ')</li><li id="forb_' + docs[composer].id + '" class="forb ' + cforb + '"><a href="javascript:conc_compforbid(\'' + docs[composer].id + '\');">forbidden</a></li><li id="cfav_' + docs[composer].id + '" class="fav ' + cfav + '"><a href="javascript:conc_compfavorite(\'' + docs[composer].id + '\');">fav</a></li><li class="radio"><a href="javascript:conc_newradio({composer:' + docs[composer].id + '});">radio</a></li><li class="edit"><a href="javascript:conc_editcomposer(\'' + docs[composer].id + '\');">edit</a></li></ul></li>');
      }

      $('#composers').scrollLeft(0);
    }
    /*else
    {
      $('#composers').html(compcontent);
    }*/
}

// genres list

conc_genresbycomposer = function (composer, genre)
{
  window.albumlistnext = 0;

  $.ajax({
    url: conc_options.opusbackend + '/genre/list/composer/' + composer + '.json',
    method: "GET",
    success: function (response) {
      
      var list = response;

      if (list.status.success == "true") {
        localStorage.lastcomposerid = list.composer.id;

        $('#genresworks h4').html('');
        $('#playlistdetail').hide();
        $('#genresworks h2').html('<a href="javascript:conc_genresbycomposer (' + list.composer.id + ')">' + list.composer.name + '</a>');
        $('#genresworks h3').html('');
        $('#genres').css("display", "inline-block");
        $('#works').css("display", "inline-block");
        $('#searchbywork').css("display", "block");
        $('#genres').html('');
        $('#works').html('');
        $('#albums').html('');
        $('#albums').hide();

        $('#genres').append('<li id="all"><a href="javascript:conc_worksbycomposer(\'' + list.composer.id + '\',\'all\');">All</a><a class="radio" href="javascript:conc_newradio({composer:' + list.composer.id + '});">radio</a></li>');
        $('#genres').append('<li id="fav"><a href="javascript:conc_listfavoriteworks(\'' + list.composer.id + '\');">Favorites</a><a class="radio" href="javascript:conc_newradio({composer:' + list.composer.id + ',work:\'fav\'});">radio</a></li>');

        var lastgenre = '';

        docsg = list.genres;
        for (dgenre in docsg) {
          $('#genres').append('<li id="' + conc_slug(docsg[dgenre]) + '"><a href="javascript:conc_worksbycomposer(\'' + list.composer.id + '\',\'' + docsg[dgenre] + '\');">' + (docsg[dgenre] == 'Recommended' ? 'Essential' : docsg[dgenre]) + '</a><a class="radio" href="javascript:conc_newradio({composer:' + list.composer.id + ',genre:\'' + docsg[dgenre] + '\'});">radio</a></li>');
        }

        if (!genre) {
          if ($('#genres #recommended').length) {
            genre = 'Recommended';
          }
          else {
            genre = 'all';
          }
        }

        if (genre == 'fav') {
          conc_listfavoriteworks(list.composer.id);
        }
        else {
          conc_worksbycomposer(list.composer.id, genre);
        }
      }
      
    }
  });
}

// works list

conc_worksbycomposer = function (composer, genre)
{
  $('#worksearch').val('');

  $.ajax({
    url: conc_options.opusbackend + '/work/list/composer/' + composer + '/' + genre + '.json',
    method: "GET",
    success: function (response) {
      conc_works(response);
    }
  });
}

conc_listfavoriteworks = function (composer) 
{
  $('#worksearch').val('');

  $.ajax({
    url: conc_options.backend + '/user/' + localStorage.spotify_userid + '/composer/' + composer + '/work/fav.json',
    method: "GET",
    success: function (response) {
      conc_works(response);
    }
  });
}

conc_worksbysearch = function (composer, genre, search)
{
  if (genre == 'fav' && search.length > 3)
  {
    $.ajax({
      url: conc_options.backend + '/user/' + localStorage.spotify_userid + '/composer/' + composer + '/work/fav/search/' + search + '.json',
      method: "GET",
      success: function (response) {
        conc_works(response);
      }
    });
  }
  else if (search.length > 3)
  {
    $.ajax({
      url: conc_options.opusbackend + '/work/list/composer/' + composer + '/genre/' + genre + '/search/' + search + '.json',
      method: "GET",
      success: function (response) {
        conc_works(response);
      }
    });
  }
  else if (genre == 'fav' && search.length == 0)
  {
    conc_listfavoriteworks (composer);
  }
  else if (search.length == 0)
  {
    conc_worksbycomposer (composer, genre);
  }
}

conc_works = function (response)
{
  var list = response;

  localStorage.lastgenre = list.request.item;

  $('#works').html('');
  $('#albums').html('');

  $('#genres li').removeClass('active');
  $('#'+conc_slug(list.request.item)).addClass('active');

  $('#works').html('');

  docsw = list.works;
  lastrec = '';
  lastgenre = '';

  for (work in docsw) {
    favorite = '';
    if ($.inArray(docsw[work].id.toString(), conc_favoriteworks) != -1) {
      favorite = 'favorite';
    }

    if (list.request.item == 'Recommended' || list.request.item == 'Popular' || list.request.item == 'fav') {
      if (lastgenre != docsw[work].genre) $('#works').append('<li class="separator">' + docsw[work].genre + '</li>');
    }
    else if (lastrec != docsw[work].recommended && !(lastrec == '' && docsw[work].recommended == '0')) $('#works').append('<li class="separator">' + (docsw[work].recommended == 1 ? 'Essential': 'Other works') + '</li>');

    //docsw[work].title = docsw[work].title.replace(/\"/g, "");
    $('#works').append('<li><a href="javascript:conc_favoritework(\'' + docsw[work].id + '\',\'' + list.composer.id + '\')" class="wfav wfav_' + docsw[work].id + ' ' + favorite + '">fav</a><a href="javascript:conc_recordingsbywork(' + docsw[work].id + ',0);">' + docsw[work].title + '<span>' + docsw[work].subtitle + ' </span></a></li>');

    lastrec = docsw[work].recommended;
    lastgenre = docsw[work].genre;
  }
}

// recordings list

conc_recordingsbywork = function (work, offset)
{
  $('#worksearch').val('');
  window.albumlistwork = work;
  window.albumlistoffset = offset;
  window.albumlistnext = 0;

  if (!offset) {
    $('#genres').css("display", "none");
    $('#works').css("display", "none");
    $('#searchbywork').css("display", "none");
    $('#playlistdetail').hide();
    $('#playlistradio').hide();
    $('#albums').removeClass();
    $('#albums').html('');
    $('#genresworks h2').html('');
    $('#genresworks h3').html('');
    $('#genresworks h4').html('');
    $('#albums').addClass(work.toString());
    $('#albums').show();
  }

  $('#albums.'+work).append('<li class="loading"></li>');

  $.ajax({
    url: conc_options.backend + '/recording/list/work/' + work + '/' + offset + '.json',
    method: "GET",
    success: function (response) {

      var list = response;
      $('li.loading').remove();
      listul = '#albums.' + list.work.id;

      if ($('#albums').attr('class') == work.toString()) {
        $('#genresworks h2').html('<a href="javascript:conc_genresbycomposer (' + list.work.composer.id + ')">' + list.work.composer.name + '</a>');
        $('#genresworks h3').html(list.work.title);
        $('#genresworks h4').html(list.work.subtitle);
      }

      if (list.status.success == "true") {
        window.albumlistnext = list.next;
        docsr = list.recordings;

        for (performance in docsr) {
  
          draggable = "";
          pidsort = "";
          extraclass = "";
          extratitle = "";

          notshow = false;

          if (docsr[performance].compilation == "true") {
            if (!conc_options.compilations) {
              notshow = true;
            }
          }

          if (docsr[performance].historical == "true") {
            if (!conc_options.historical) {
              notshow = true;
            }
          }

          if (docsr[performance].verified == "true") {
            extraclass = "verified";
            extratitle = "Verified recording";
          }

          if (!notshow && !$("ul#albums." + list.work.id + " li[pid=" + list.work.id + '-' + docsr[performance].spotify_albumid + '-' + docsr[performance].set + "]").length) {
            $(listul).append('<li pid="' + list.work.id + '-' + docsr[performance].spotify_albumid + '-' + docsr[performance].set + '" ' + pidsort + ' class="performance ' + draggable + ' ' + extraclass + '" title="'+ extratitle + '"><ul>' + conc_recordingitem(docsr[performance], list.work) + '</ul></li>');
          }
        }

        if (list.status.rows <= 4 && list.next)
        {
          conc_recordingsbywork(list.work.id, list.next);
        }
      }

      if (list.status.success == "false") $(listul).append('<li class="emptylist"><p>Concertino couldn\'t find any recording of this work in the Spotify database. It might be an error, though. Please <a href="mailto:concertmasterteam@gmail.com">reach us</a> if you know a recording. This will help us correct our algorithm.</p></li>')
      if (!list.next && list.status.success == "true") $(listul).append('<li class="disclaimer"><p>These recordings were fetched automatically from the Spotify database. The list might be inaccurate or incomplete. Please <a href="mailto:concertmasterteam@gmail.com">reach us</a> for requests, questions or suggestions.</p></li>');
    }
  });
}

// random recording

conc_randomrecording = function (wid) {
  $.ajax({
    url: conc_options.backend + '/recording/list/work/' + wid + '/0.json',
    method: "GET",
    success: function (response) {
      
      if (response.status.success == "true") {

        if (!conc_options.compilations) {
          comprec = [];

          for (rec in response.recordings) {
            if (response.recordings[rec].compilation != "true") {
              comprec.push(response.recordings[rec]);
            }
          }
        }
        else {
          comprec = response.recordings;
        }

        var rnd = Math.floor((Math.random() * (comprec.length - 1)));
        var rcd = comprec[rnd];
        conc_recording(wid, rcd["spotify_albumid"], rcd["set"]);
      }
      else {
        conc_radioskip();
      }
    }
  });
}

// recording detail

conc_thisrecording = function (album, wid, set) {
  $('#radiotop #goradio').removeClass('on');
  $('#playercontrols #skip').removeClass('radio');
  $('#radiotop select').prop("disabled", false);

  conc_radioqueue = [];
  conc_radiofilter = {};
  conc_onair = false;
  
  conc_recording (wid, album, set);
}

conc_recording = function (wid, album, set, auto)
{
  if (!auto)
  {
    $('#tuning-modal').leanModal();
    $('#worksearch').val('');
  }

  $.ajax({
    url: conc_options.backend + '/recording/detail/work/' + wid + '/album/' + album + '/' + set + '.json',
    method: "GET",
    success: function (response) {
      $('#nowplaying').css('display', "block");
      if (conc_disabled) {
        $('#favorites').css('bottom', "312px");
      }
      else {
        $('#favorites').css('bottom', "384px");
      }
      $("#timerglobal").html('0:00');
      conc_recordingaction (response, auto);
    }
  });
}

conc_recordingaction = function (list, auto)
{
  if (list.status.success == "true") {

    if (list.recording.length == 0) {
      conc_notavailable();
    }
    else if (list.recording.markets.indexOf(localStorage.user_country) != -1) {

      if (window.location.pathname != '/u/' + list.work.id + '/' + list.recording.spotify_albumid + '/' + list.recording.set) {
        window.history.pushState({}, 'Concertino', '/u/' + list.work.id + '/' + list.recording.spotify_albumid + '/' + list.recording.set);
      }

      document.title = `${list.work.composer.name}: ${list.work.title} - Concertino`;

      $('#playerinfo').html(conc_recordingitem(list.recording, list.work));

      verify = '<li class="notverified"><a href="javascript:conc_qualify()">This recording was fetched automatically with no human verification. Is everything right? Click here and help us to improve our data.</a></li>';
      verify += '<li class="verified"><a href="javascript:conc_qualify()">This recording was verified by a human and its metadata was considered right. Disagree? Click here and help us to improve our data.</a></li>';
      verify += '<li class="report">Thanks for reporting. This recording will be excluded from our database.</li>';
      
      pform = [];
      for (i in list.recording.performers) {
        pform.push (list.recording.performers[i].name + (list.recording.performers[i].role != '' && list.recording.performers[i].role != 'Orchestra' && list.recording.performers[i].role != 'Ensemble' && list.recording.performers[i].role != 'Choir' ? ', ' + list.recording.performers[i].role : ''));
      }
      
      verify += '<li class="perform"><a href="javascript:conc_editperformers();conc_qualify();">Thanks for your collaboration! Edit the performers in the field below. One per line. Specify their roles (instrument, voice etc) after commas.</a><textarea>'+pform.join('\n')+'</textarea><a class="submit" href="javascript:conc_submitperf(' + list.work.id + ',\'' + list.recording.spotify_albumid + '\',' + list.recording.set + ')">Done</a></li>';
      verify += '<li class="versionform"><a href="javascript:conc_editobs();conc_qualify();">Thanks for your help! Specify below which version of the work this recording uses, including instrumentation and author, if not the composer</a><textarea>'+list.work.subtitle+'</textarea><a class="submit" href="javascript:conc_submitobs(' + list.work.id + ',\'' + list.recording.spotify_albumid + '\',' + list.recording.set + ')">Done</a></li>';

      verify += '<li class="tagloading">loading</li>';
      verify += '<li class="button verify"><a href="javascript:conc_rectag(' + list.work.id + ',\'' + list.recording.spotify_albumid + '\',' + list.recording.set + ',\'verified\',1)"><strong>Everything OK!</strong>Metadata is correct and the recording is complete</a></li>';
      verify += '<li class="button edit"><a href="javascript:conc_editperformers()"><strong>Complete but missing information</strong>Recording is complete but data on performers is lacking</a></li>';
      verify += '<li class="button partial"><a href="javascript:conc_rectag(' + list.work.id + ',\'' + list.recording.spotify_albumid + '\',' + list.recording.set + ',\'compilation\',1)"><strong>Correct but incomplete</strong>Metadata is right but the recording is partial/missing movements</a></li>';
      verify += '<li class="button version"><a href="javascript:conc_editobs()"><strong>Correct but a different version</strong>Not the original work - it\'s an arrangement or adaptation</a></li>';
      
      verify += '<li class="button wrongdata"><a href="javascript:conc_rectag(' + list.work.id + ',\'' + list.recording.spotify_albumid + '\',' + list.recording.set + ',\'wrongdata\',1)"><strong>Wrong work</strong>The description doesn\'t match the recording</a></li>';
      verify += '<li class="button badquality"><a href="javascript:conc_rectag(' + list.work.id + ',\'' + list.recording.spotify_albumid + '\',' + list.recording.set + ',\'badquality\',1)"><strong>Bad quality recording</strong>This isn\'t a real recording - it\'s played by a computer</a></li>';

      $('#playerverify').html(verify);
      $('#playerverify').removeClass('reported').toggleClass('verified', (list.recording.verified == 'true'));
      $('#playertracks').html('');
      $('#globaltracks').html('');

      if (list.recording.tracks.length >= 60) {
        trackadjust = ' - 0.03px';
        $('#globaltracks').addClass("tootoomanytracks");
      }
      else {
        trackadjust = ' - 2px';
        $('#globaltracks').removeClass("tootoomanytracks");
        if (list.recording.tracks.length >= 12) 
        {
          $('#globaltracks').addClass("toomanytracks");
        }
        else
        {
          $('#globaltracks').removeClass("toomanytracks");
        }
      }

      var currtrack = 0;
      conc_playbuffer.accdurations = [0];
      conc_playbuffer.tracks = [];
      conc_playbuffer.tracksuris = list.recording.spotify_tracks;

      for (track in list.recording.tracks) {
        conc_playbuffer.tracks[track] = list.recording.tracks[track].spotify_trackid;
        conc_playbuffer.accdurations[parseInt(track) + 1] = parseInt(list.recording.tracks[track].length) + parseInt(conc_playbuffer.accdurations[parseInt(track)]);

        var pctsize = ((list.recording.tracks[track].length) / list.recording.length) * 100;
        currtrack = currtrack + 1;
        $('#playertracks').append('<li><a class="tracktitle" href="javascript:conc_track(' + track + ')">' + list.recording.tracks[track].title + '</a><div id="timer-' + list.recording.tracks[track].spotify_trackid + '" class="timer">0:00</div><div id="slider-' + list.recording.tracks[track].spotify_trackid + '" class="slider"><div class="buffer"></div><div class="bar"></div></div><div class="duration">' + conc_readabletime(list.recording.tracks[track].length) + '</div></li>');
        $('#globaltracks').append('<li style="width: calc(' + Math.round(pctsize * 1000) / 1000 + '%' + trackadjust + ')"><a class="tracktitle" href="javascript:conc_track(' + track + ')">' + currtrack + '</a><div id="globalslider-' + list.recording.tracks[track].spotify_trackid + '" class="slider"><div class="buffer"></div><div class="bar"></div></div><div id="globaltimer-' + track + '" class="timer">0:00</div><div class="duration">' + conc_readabletime(list.recording.tracks[track].length) + '</div></li>');
      }

      $('#durationglobal').html(conc_readabletime(list.recording.length));

      if (!auto) {
        conc_notification(list.work.title, list.recording.cover, list.work.composer.name);
        conc_spotifyplay(list.recording.spotify_tracks, 0);

        // registering play
        localStorage.lastwid = list.work.id;
        localStorage.lastaid = list.recording.spotify_albumid;
        localStorage.lastset = list.recording.set;
        $.ajax({
          url: conc_options.backend + '/dyn/user/recording/played/',
          method: "POST",
          data: { id: localStorage.spotify_userid, wid: list.work.id, aid: list.recording.spotify_albumid, set: list.recording.set, cover: list.recording.cover, performers: JSON.stringify(list.recording.performers), auth: conc_authgen() },
          success: function (response) {
            if ($('#favtitle select option:checked').val() == 'rec') {
              conc_recentrecordings();
            }
          }
        });
      }

    }
    else {
      conc_notavailable();
    }
  }
  else {
    conc_notavailable();
  }
}

conc_playingdetails = function ()
{
    if (document.getElementById('nowplaying').className == 'up')
    {
        document.getElementById('nowplaying').className = 'down';
    }
    else
    {
        document.getElementById('nowplaying').className = 'up';
    }
}

// recording item

conc_recordingitem = function (item, work, playlist)
{
  if (typeof item.label === 'undefined') item.label = '';
  if (typeof work.subtitle === 'undefined') work.subtitle = '';
  if (typeof item.observation === 'undefined') item.observation = '';

  alb = '';
  alb = alb + '<li class="permalink"><a href="javascript:conc_permalink(' + work.id + ',\'' + item.spotify_albumid + '\',' + item.set + ')">permalink</a></li>';
  
  rid = work.id + '-' + item.spotify_albumid + '-' + item.set;

  if ($.inArray(rid, conc_favorites) != -1)
  {
    alb = alb + '<li class="favorite"><a href="javascript:conc_recfavorite(' + work.id + ',\'' + item.spotify_albumid + '\',' + item.set + ')" class="is fav_' + rid + '">unfavorite</a></li>';
  }
  else
  {
    alb = alb + '<li class="favorite"><a href="javascript:conc_recfavorite(' + work.id + ',\'' + item.spotify_albumid + '\',' + item.set + ')" class="go fav_' + rid + '">favorite</a></li>';
  }

  if (playlist) {
    if (playlist.owner.id == localStorage.spotify_userid) {
      plaction = 'unplaylist';
      plfunction = 'conc_unplaylistperformance(' + work.id + ',\'' + item.spotify_albumid + '\',' + item.set + ',' + playlist.id + ')';
    }
    else {
      plaction = 'doplaylist';
      plfunction = 'conc_playlistmodal(' + work.id + ',\'' + item.spotify_albumid + '\',' + item.set + ')';
    }
  }
  else {
    plaction = 'doplaylist';
    plfunction = 'conc_playlistmodal(' + work.id + ',\'' + item.spotify_albumid + '\',' + item.set + ')';
  }

  alb = alb + '<li class="playlist '+ plaction +'"><a href="javascript:'+ plfunction +'">playlist</a></li>';

  alb = alb + '<li class="cover"><a href="javascript:conc_thisrecording(\'' + item.spotify_albumid +'\','+work.id+','+item.set+')">';
  alb = alb + '<img src="' + item.cover + '" onerror="this.src=\'/img/nocover.png\'" />';
  alb = alb + '<div class="overlay"></div></a></li>';

  alb = alb+'<li class="composer"><a href="javascript:conc_genresbycomposer('+work.composer.id+')">'+work.composer.name+'</a></li>';
  alb = alb + '<li class="work"><a href="javascript:conc_recordingsbywork(' + work.id + ',0)">' + work.title +'<span>' + work.subtitle + '</span></a></li>';
  if (item.observation) alb = alb + '<li class="version">' + item.observation + '</li>';

  var spotify_link = 'http://open.spotify.com/album/' + item.spotify_albumid;

  if (typeof item.spotify_tracks !== 'undefined') {
    if (item.spotify_tracks.length == 1) {
      spotify_link = 'http://open.spotify.com/track/' + item.spotify_tracks[0].replace ("spotify:track:", "");
    }
  }

  alb = alb + '<li class="performers"><ul>' + conc_listperformers(item.performers) + '</ul></li>';
  alb = alb + '<li class="label">'+item.label+'</li>';
  alb = alb + '<li class="spotify"><a href="' + spotify_link + '" target="_blank">Listen on Spotify</a></li>';

  return alb;
}

// performers list

conc_listperformers = function (aperformers) {

  albpone = [];
  albptwo = [];
  albptwohalf = [];
  albpthree = [];
  albc = '';
  albo = '';
  albor = '';
  classmain = '';

  if (aperformers.length <= 4)
  {
      classmain = 'mainperformer';
  }

  perfnum = 0;

  for (performers in aperformers)
  {
    if (aperformers[performers].role === null)
    {
      aperformers[performers].role = "";
    }

    if (aperformers[performers].role.trim() == "Conductor")
    {
      albpthree.push ('<li class="mainperformer"><strong>'+aperformers[performers].name+'</strong>, ' + aperformers[performers].role + '</li>');
    }
    else if (aperformers[performers].role.trim() == "Ensemble" || aperformers[performers].role.trim() == "Orchestra")
    {
      albptwo.push ('<li class="mainperformer"><strong>'+aperformers[performers].name+'</strong></li>');
    }
    else if (aperformers[performers].role.trim() == "Choir")
    {
      albptwohalf.push ('<li class="'+classmain+'"><strong>'+aperformers[performers].name+'</strong></li>');
    }
    else if (aperformers[performers].role.trim() == "")
    {
      albpone.push ('<li class="' + classmain + '"><strong>' + aperformers[performers].name + '</strong></li>');
    }
    else
    {
      albpone.push ('<li class="'+classmain+'"><strong>'+aperformers[performers].name+'</strong>, ' + aperformers[performers].role + '</li>');
    }
  }

  if (aperformers.length > 4 && albpthree.length == 0 && albptwo.length == 0) {
    for (oneperfs in albpone) {
      if (oneperfs <= 3) albpone[oneperfs] = albpone[oneperfs].replace ('class=""', 'class="mainperformer"');
    }
  }

  return albpone.join('') + albptwo.join('') + albptwohalf.join('') + albpthree.join('');
}

// error messages

conc_notavailable = function () {
  if (conc_onair) {
    conc_radioskip();
  }
  else {
    $('#tuning-modal').hide();
    $("#notavailable").leanModal();
  }
}

// showing playing bar

conc_showplayerbar = function ()
{
  $('#playerbar').css('display',"block");
  $('#main').css('bottom',"68px");
  $('#nowplaying').css('bottom',"68px");
  $('#sidebar').css('bottom',"68px");
  $('#favorites').css('bottom', "68px");
}

// notification

conc_notification = function (text, icon, title)
{
  if (conc_disabled) return;

  let options =
    {
      body: text,
      icon: icon,
      silent: true
    };

  var n = new Notification (title, options);
  setTimeout(n.close.bind(n), 5000);
}

// generating auth hash

conc_authgen = function ()
{
  let timestamp = (((new Date() / 1000 | 0) + (60 * 1)) / (60 * 5) | 0);
  let auth = md5 (timestamp + "-" + localStorage.spotify_userid + "-" + localStorage.user_auth);

  return auth;
}

// tagging or untagging a recording

conc_rectag = function (wid, aid, set, tag, value) {
  rid = wid + '-' + aid + '-' + set;
  if (value == 1) {
    action = 'tag';
  }
  else {
    action = 'untag';
  }

  $('#playerverify').toggleClass('loading');

  $.ajax({
    url: conc_options.backend + '/recording/detail/work/' + wid + '/album/' + aid + '/' + set + '.json',
    method: "GET",
    success: function (response) {

      $.ajax({
        url: conc_options.backend + '/dyn/recording/' + action + '/',
        method: "POST",
        data: { id: localStorage.spotify_userid, wid: wid, aid: aid, set: set, cover: response.recording.cover, performers: JSON.stringify(response.recording.performers), auth: conc_authgen(), tag: tag },
        success: function (nresponse) {
          if (nresponse.status.success == "true") {

            $('#playerverify').toggleClass('loading');
            $('#playerverify').toggleClass('opened');

            if (action == 'tag') {

              if (tag == 'verified' || tag == 'compilation') {
                $('#playerverify').toggleClass('verified', true);
                if (window.albumlistwork == wid) {
                  $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').show();
                  $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').toggleClass('verified', true);
                  $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').parent().prepend($('#albums li[pid=' + wid + '-' + aid + '-' + set + ']'));
                }
              }
              else if (tag == 'wrongdata' || tag == 'badquality') {
                $('#playerverify').toggleClass('reported', true);
                if (window.albumlistwork == wid) $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').hide();
              }
            }
          }
        }
      });

    }
  });
}

// editing performers of a recording 

conc_editperformers = function () {
  $('#playerverify').toggleClass('editingperf');
}

conc_submitperf = function (wid, aid, set) {

  if ($('#nowplaying textarea').val().length > 0) {

    $('#playerverify').toggleClass('loading');

    $.ajax({
      url: conc_options.backend + '/recording/detail/work/' + wid + '/album/' + aid + '/' + set + '.json',
      method: "GET",
      success: function (response) {

        $.ajax({
          url: conc_options.backend + '/dyn/recording/edit/',
          method: "POST",
          data: { id: localStorage.spotify_userid, wid: wid, aid: aid, set: set, auth: conc_authgen(), cover: response.recording.cover, performers: JSON.stringify(response.recording.performers), newperformers: $('#nowplaying li.perform textarea').val() },
          success: function (response) {
            if (response.status.success == "true") {

              $('#playerverify').toggleClass('loading');
              $('#playerverify').toggleClass('editingperf');
              $('#playerverify').toggleClass('verified', true);
              $('#playerverify').toggleClass('opened', false);

              $('#nowplaying li.performers').html(conc_listperformers(response.recording.performers));

              if (window.albumlistwork == wid) {
                $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').show();
                $('#albums li[pid=' + wid + '-' + aid + '-' + set + '] li.performers').html(conc_listperformers(response.recording.performers));
                $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').toggleClass('verified', true);
                $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').parent().prepend($('#albums li[pid=' + wid + '-' + aid + '-' + set + ']'));
              }
            }
          }
        });

      }
    });
  }
}

// editing recording observation

conc_editobs = function () {
  $('#playerverify').toggleClass('editingobs');
}

conc_submitobs = function (wid, aid, set) {

  $('#playerverify').toggleClass('loading');

  $.ajax({
    url: conc_options.backend + '/recording/detail/work/' + wid + '/album/' + aid + '/' + set + '.json',
    method: "GET",
    success: function (response) {

      $.ajax({
        url: conc_options.backend + '/dyn/recording/edit/',
        method: "POST",
        data: { id: localStorage.spotify_userid, wid: wid, aid: aid, set: set, auth: conc_authgen(), cover: response.recording.cover, performers: JSON.stringify(response.recording.performers), observation: 1, observationvalue: $('#nowplaying li.versionform textarea').val() },
        success: function (rresponse) {
          if (rresponse.status.success == "true") {

            $('#playerverify').toggleClass('loading');
            $('#playerverify').toggleClass('editingobs');
            $('#playerverify').toggleClass('verified', true);
            $('#playerverify').toggleClass('opened', false);

            $('#nowplaying li.work').html('<a href="javascript:conc_recordingsbywork(' + response.work.id + ',0)">' + response.work.title +'<span>' + rresponse.recording.observation + '</span></a>');

            if (window.albumlistwork == wid) {
              $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').show();
              $('#albums li[pid=' + wid + '-' + aid + '-' + set + '] li.version').remove();
              if (rresponse.recording.observation) $('<li class="version">'+rresponse.recording.observation+'</li>').insertBefore('#albums li[pid=' + wid + '-' + aid + '-' + set + '] li.performers');
              $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').toggleClass('verified', true);
              $('#albums li[pid=' + wid + '-' + aid + '-' + set + ']').parent().prepend($('#albums li[pid=' + wid + '-' + aid + '-' + set + ']'));
            }
          }
        }
      });

    }
  });
}

// adding or removing favorite recording

conc_recfavorite = function (wid, aid, set)
{
  rid = wid + '-' + aid + '-' + set;
  if ($.inArray(rid, conc_favorites) != -1)
  {
    action = 'unfavorite';
  }
  else
  {
    action = 'favorite';
  }

  $.ajax({
    url: conc_options.backend + '/recording/detail/work/' + wid + '/album/' + aid + '/' + set + '.json',
    method: "GET",
    success: function (response) {

      $.ajax({
        url: conc_options.backend + '/dyn/user/recording/' + action + '/',
        method: "POST",
        data: { id: localStorage.spotify_userid, wid: wid, aid: aid, set: set, cover: response.recording.cover, performers: JSON.stringify(response.recording.performers), auth: conc_authgen() },
        success: function (response) {
          if (response.status.success == "true") {
            
            if (action == 'favorite') {
              $('.fav_' + rid).removeClass('go');
              $('.fav_' + rid).addClass('is');
            }
            else {
              $('.fav_' + rid).removeClass('is');
              $('.fav_' + rid).addClass('go');
            }

            if (action == 'favorite' || $('#favtitle select').val() == "fav") {
              conc_playlist("fav");
            }
          }
        }
      });

    }
  });  
}

// adding or removing favorite work

conc_favoritework = function (wid, cid) {
  if ($.inArray(wid.toString(), conc_favoriteworks) != -1) {
    action = 'unfavorite';
  }
  else {
    action = 'favorite';
  }

  $.ajax({
    url: conc_options.backend + '/dyn/user/work/' + action + '/',
    method: "POST",
    data: { id: localStorage.spotify_userid, wid: wid, cid: cid, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {
        conc_favoriteworks = (response.list ? response.list : []);
        $('.wfav_' + wid).toggleClass('favorite');

        if ($('li#fav').hasClass('active')) {
          conc_listfavoriteworks(localStorage.lastcomposerid);
        }
      }
    }
  });
}

// initializing interface

conc_init = function ()
{
  $.ajax({
    url: conc_options.backend + '/user/' + localStorage.spotify_userid + '/lists.json',
    method: "GET",
    success: function (response) 
    {
      conc_favoritecomposers = (response.favorite ? response.favorite : []);
      conc_forbiddencomposers = (response.forbidden ? response.forbidden : []);
      conc_favoriteworks = (response.works ? response.works : []);
      conc_playlists = (response.playlists ? response.playlists : {});

      conc_composersbytag('pop');
      conc_genresbycomposer(localStorage.lastcomposerid, localStorage.lastgenre);
      conc_playlist("fav");
    }
  });
}

// favorite recordings

conc_favoriterecordings = function ()
{
  $('#favorites .performance').remove();
  $.ajax({
    url: conc_options.backend + '/user/' + localStorage.spotify_userid + '/recording/fav.json',
    method: "GET",
    success: function (response) {
      conc_favorites = response.list;
      docsr = response.recordings;
      
      for (performance in docsr) {
        listul = '#favalbums';

        draggable = "";
        pidsort = "";

        $(listul).append('<li pid="' + docsr[performance].work.id + '-' + docsr[performance].spotify_albumid + '-' + docsr[performance].set + '" ' + pidsort + ' class="performance ' + draggable + '"><ul>' + conc_recordingitem(docsr[performance], docsr[performance].work) + '</ul></li>');
      }
    }
  });
}

// recent recordings

conc_recentrecordings = function () {
  $('#favorites .performance').remove();
  $.ajax({
    url: conc_options.backend + '/user/' + localStorage.spotify_userid + '/recording/recent.json',
    method: "GET",
    success: function (response) {
      docsr = response.recordings;

      for (performance in docsr) {
        listul = '#favalbums';

        $(listul).append('<li pid="' + docsr[performance].work.id + '-' + docsr[performance].spotify_albumid + '-' + docsr[performance].set + '" class="performance"><ul>' + conc_recordingitem(docsr[performance], docsr[performance].work) + '</ul></li>');
      }
    }
  });
}

// playlist recordings

conc_playlistrecordings = function (pid) {
  $('#favorites .performance').remove();
  $.ajax({
    url: conc_options.backend + '/recording/list/playlist/'+pid+'.json',
    method: "GET",
    success: function (response) {
      docsr = response.recordings;

      for (performance in docsr) {
        listul = '#favalbums';
        draggable = "draggable";
        pidsort = "";

        $(listul).append('<li pid="' + docsr[performance].work.id + '-' + docsr[performance].spotify_albumid + '-' + docsr[performance].set + '" class="performance"><ul>' + conc_recordingitem(docsr[performance], docsr[performance].work, response.playlist) + '</ul></li>');
      }
    }
  });
}

// adding or removing favorite composers

conc_compfavorite = function (cid) {
  if ($('#cfav_' + cid).hasClass('favorite'))
  {
    action = 'unfavorite';
  }
  else 
  {
    action = 'favorite';
  }

  $.ajax({
    url: conc_options.backend + '/dyn/user/composer/' + action + '/',
    method: "POST",
    data: { id: localStorage.spotify_userid, cid: cid, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {
        
        conc_favoritecomposers = (response.list ? response.list : []);

        $('#cfav_' + cid).toggleClass('favorite');

        if ($('#composers li.index').hasClass('favorite')) {
          conc_composersbyfav();
        }
      }
    }
  });
}

// adding or removing forbidden composers

conc_compforbid = function (cid) {
  if ($('#forb_' + cid).hasClass('forbidden')) {
    action = 'permit';
  }
  else {
    action = 'forbid';
  }

  $.ajax({
    url: conc_options.backend + '/dyn/user/composer/' + action + '/',
    method: "POST",
    data: { id: localStorage.spotify_userid, cid: cid, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {

        conc_forbiddencomposers = (response.list ? response.list : []);

        $('#forb_' + cid).toggleClass('forbidden');
      }
    }
  });
}

// playlists menu

conc_listplaylists = function (playlist_slug) {
  $('#favtitle select').css('visibility', 'hidden');

  if (!playlist_slug || playlist_slug == "fav") {
    playlist_slug = "fav";
    $('#sidebar').removeClass('sequenplay');
  }
  else if (playlist_slug == "rec") {
    playlist_slug = "rec";
    $('#sidebar').removeClass('sequenplay');
  }
  else {
    $('#sidebar').addClass('sequenplay');
  }

  $('#favtitle select').html('');

  var favoption = new Option("Favorites", "fav");
  $('#favtitle select').append($(favoption));

  var favoption = new Option("Recently Played", "rec");
  $('#favtitle select').append($(favoption));

  for (pllst in conc_playlists)
  {
    var favoption = new Option(conc_playlists[pllst].name, conc_playlists[pllst].id);
    $('#favtitle select').append($(favoption));
  }

  $('#favtitle select').val(playlist_slug);
  $('#favtitle select').css('visibility', 'visible');
}

conc_playlist = function (playlist) {
  conc_listplaylists (playlist);
  if (playlist == "fav") {
    conc_favoriterecordings();
  }
  else if (playlist == "rec") {
    conc_recentrecordings();
  }
  else {
    conc_playlistrecordings(playlist);
  }
}

// playlist modal

conc_playlistmodal = function (wid, aid, set) {
  $('#playlistmodal #existingplaylist').html('');
  var favoptions = Array();
  
  var favoption = new Option("Choose a playlist", "0");
  $('#playlistmodal #existingplaylist').append($(favoption));

  for (pllst in conc_playlists) {
    if (conc_playlists[pllst].owner == localStorage.spotify_userid)
    {
      var favoption = new Option(conc_playlists[pllst].name, conc_playlists[pllst].id);
      $('#playlistmodal #existingplaylist').append($(favoption));
    } 
  }

  $('#playlistmodal #newplaylist').val('');
  window.playlistwid = wid;
  window.playlistaid = aid;
  window.playlistset = set;
  $('#tuning-modal').hide();
  $("#playlistmodal").leanModal();
}

conc_addtoplaylist = function () {
  if ($('#playlistmodal #newplaylist').val() != "") {
    conc_playlistperformance(window.playlistwid, window.playlistaid, window.playlistset, 'new', $('#playlistmodal #newplaylist').val(), 1);
  }
  else if ($('#playlistmodal #existingplaylist').val() != "0") {
    conc_playlistperformance(window.playlistwid, window.playlistaid, window.playlistset, $('#playlistmodal #existingplaylist').val(), $('#playlistmodal #existingplaylist option:checked').text(), 1);
  }
}

// add to playlist

conc_playlistperformance = function (wid, aid, set, pid, name) {

  $.ajax({
    url: conc_options.backend + '/recording/detail/work/' + wid + '/album/' + aid + '/' + set + '.json',
    method: "GET",
    success: function (response) {
      
      $.ajax({
        url: conc_options.backend + '/dyn/recording/addplaylist/',
        method: "POST",
        data: { id: localStorage.spotify_userid, wid: wid, aid: aid, set: set, pid: pid, name: name, cover: response.recording.cover, performers: JSON.stringify(response.recording.performers), auth: conc_authgen() },
        success: function (response) {
          if (response.status.success == "true") {
            conc_playlists = (response.list ? response.list : {});
            conc_playlist(response.playlist.id);
            $('#playlistmodal').closeModal();
          }
        }
      });

    }
  });
}

// remove from playlist

conc_unplaylistperformance = function (wid, aid, set, pid) {
  $.ajax({
    url: conc_options.backend + '/dyn/recording/unplaylist/',
    method: "POST",
    data: { id: localStorage.spotify_userid, wid: wid, aid: aid, set: set, pid: pid, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {
        conc_playlists = (response.list ? response.list : {});
        conc_playlist(pid);
        $('#playlistmodal').closeModal();
      }
    }
  });
}

// renaming and deleting playlists

conc_editplaylist = function () {

  window.editplaylist = $('#favtitle select option:checked').val();
  $('#tuning-modal').hide();

  for (pllst in conc_playlists) {
    if (conc_playlists[pllst].id == window.editplaylist) {
      playlist_owner = conc_playlists[pllst].owner;
    }
  }

  if (playlist_owner == localStorage.spotify_userid) {
    $('#playlist_newname').val($('#favtitle select option:checked').text());
    $('#toggle_delpl').toggles(false);
    $("#editplaylistmodal").leanModal();
  }
  else {
    $('#playlist_dupname').val($('#favtitle select option:checked').text());
    $('#toggle_unsubpl').toggles(false);
    $("#unsubscribemodal").leanModal();
  }
}

conc_renameplaylist = function () {

  if ($('#playlist_newname').val()) {
    $.ajax({
      url: conc_options.backend + '/dyn/playlist/rename/',
      method: "POST",
      data: { id: localStorage.spotify_userid, pid: window.editplaylist, name: $('#playlist_newname').val(), auth: conc_authgen() },
      success: function (response) {
        if (response.status.success == "true") {
          conc_playlists = (response.list ? response.list : {});
          conc_playlist(window.editplaylist);
          $('#editplaylistmodal').closeModal();
        }
      }
    });
  }
}

conc_deleteplaylist = function () {
  $.ajax({
    url: conc_options.backend + '/dyn/playlist/delete/',
    method: "POST",
    data: { id: localStorage.spotify_userid, pid: window.editplaylist, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {
        conc_playlists = (response.list ? response.list : {});
        conc_playlist("fav");
        $('#editplaylistmodal').closeModal();
        $('#toggle_delpl').toggles(false);
      }
    }
  });
}

// importing and unsubscribing playlists

conc_importplaylist = function (name) {
  $.ajax({
    url: conc_options.backend + '/dyn/user/playlist/duplicate/',
    method: "POST",
    data: { name: name, id: localStorage.spotify_userid, pid: window.editplaylist, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {
        window.newplaylist = response.playlist.id;
        conc_gounsubplaylist(window.editplaylist, function (response) {
          conc_playlists = (response.list ? response.list : {});
          conc_playlist(window.newplaylist);
          $('#unsubscribemodal').closeModal();
        });
      }
    }
  });
}

conc_subplaylist = function (pid) {
  $.ajax({
    url: conc_options.backend + '/dyn/user/playlist/subscribe/',
    method: "POST",
    data: { id: localStorage.spotify_userid, pid: pid, auth: conc_authgen() },
    success: function (response) {
      if (response.status.success == "true") {
        conc_playlists = (response.list ? response.list : {});
        conc_playlist(pid);
      }
    }
  });
}

conc_unsubplaylist = function () {
  conc_gounsubplaylist(window.editplaylist, function (response) {
    if (response.status.success == "true") {
      conc_playlists = (response.list ? response.list : {});
      conc_playlist("fav");
      $('#unsubscribemodal').closeModal();
      $('#toggle_unsubpl').toggles(false);
    }
  });
}

conc_gounsubplaylist = function (pid, action) {
  $.ajax({
    url: conc_options.backend + '/dyn/user/playlist/unsubscribe/',
    method: "POST",
    data: { id: localStorage.spotify_userid, pid: pid, auth: conc_authgen() },
    success: action
  });
}

// playlist detail

conc_playlistdetail = function (pid) {

  $.ajax({
    url: conc_options.backend + '/recording/list/playlist/' + pid + '.json',
    method: "GET",
    success: function (response) {
      docsr = response.recordings;

      window.playlistid = pid;

      $('#playlistdetail').hide();
      $('#playlistdetail .unsubscribe').hide();
      $('#playlistdetail .subscribe').show();
      $('#playlistradio').show();

      $('#genres').css("display", "none");
      $('#works').css("display", "none");
      $('#searchbywork').css("display", "none");

      $('#albums').addClass('playlist');
      $('#albums').html('');
      $('#genresworks h2').html('playlist');
      $('#genresworks h3').html(response.playlist.name);
      $('#genresworks h4').html(`by <a href="https://open.spotify.com/user/${response.playlist.owner.id}">${response.playlist.owner.name}</a>`);

      for (pllst in conc_playlists) {
        if (conc_playlists[pllst].id == pid) {
          $('#playlistdetail .subscribe').hide();
          $('#playlistdetail .unsubscribe').show();
        }
      }

      if (response.playlist.owner.id != localStorage.spotify_userid) {
        $('#playlistdetail').show();
      }

      for (performance in docsr) {
        listul = '#albums';
        draggable = "";
        pidsort = "";

        $(listul).append('<li pid="' + docsr[performance].work.id + '-' + docsr[performance].spotify_albumid + '-' + docsr[performance].set + '" class="performance"><ul>' + conc_recordingitem(docsr[performance], docsr[performance].work, response.playlist) + '</ul></li>');
      }
    }
  });
}

// new radio

conc_newradio = function (filter) {
  if (filter.genre == 'Popular') filter.popularwork = 1;
  if (filter.genre == 'Recommended') filter.recommendedwork = 1;
  if (filter.genre == 'Recommended' || filter.genre == 'Popular') filter.genre = '';
  if (conc_disabled) {
    $(`#${conc_disabledreason}`).leanModal(); return;
  }
  $.ajax({
    url: conc_options.backend + '/dyn/user/work/random/',
    method: "POST",
    data: { id: localStorage.spotify_userid, popularcomposer: filter.popularcomposer, recommendedcomposer: filter.recommendedcomposer, popularwork: filter.popularwork, recommendedwork: filter.recommendedwork, genre: filter.genre, epoch: filter.epoch, composer: filter.composer, work: filter.work },
    success: function (response) {
      if (response.status.success == "true") {

        conc_radioqueue = [];
        for (wk in response.works)
        {
          conc_radioqueue.push(response.works[wk]);
        }

        conc_onair = true;
        conc_radiofilter = filter;
        conc_radiofilter.type = 'radio';

        if (!$('#tuning-modal').is(':visible')) { $('#tuning-modal').leanModal(); }

        $('#radiotop #goradio').removeClass('on');
        $('#radiotop #goradio').addClass('on');

        $('#playercontrols #skip').removeClass('radio');
        $('#playercontrols #skip').addClass('radio');

        $('#radiotop select').prop("disabled", true);

        conc_randomrecording (conc_radioqueue.shift().id);
      }
    }
  });
}

// radio skip

conc_radioskip = function () {
  if (conc_onair) {
    if (conc_radioqueue.length) {
      if (Object.keys(conc_state).length > 0 && !conc_state.paused) {
        spotplayer.pause();
      }
      if (!$('#tuning-modal').is(':visible')) { $('#tuning-modal').leanModal(); }
      if (conc_radiofilter.type == 'playlist') {
        var thisrec = conc_radioqueue.shift();
        thisrec = thisrec.split('-');
        conc_recording (thisrec[0], thisrec[1], thisrec[2]);
      }
      else {
        conc_randomrecording(conc_radioqueue.shift().id);
      }
    }
    else {
      if (conc_radiofilter.type == 'playlist') {
        conc_radiobutton();
      }
      else {
        conc_newradio (conc_radiofilter);
      }
    }
  }
}

// radio button

conc_radiobutton = function () {
  if (conc_disabled) {
    $(`#${conc_disabledreason}`).leanModal(); return;
  }
  $('#radiotop #goradio').toggleClass('on');
  $('#playercontrols #skip').toggleClass('radio');

  if ($('#radiotop #goradio').hasClass('on')) {
    filter = { genre: $('#radiotop select.genres option:checked').val(), epoch: $('#radiotop select.periods option:checked').val() };
    if ($('#radiotop select.composers option:checked').val() == "wfav") {
      filter.work = "fav";
    }
    else if ($('#radiotop select.composers option:checked').val() == "wrec") {
      filter.recommendedwork = "1";
    }
    else if ($('#radiotop select.composers option:checked').val() == "rec") {
      filter.recommendedcomposer = "1";
    }
    else if ($('#radiotop select.composers option:checked').val() == "wpop") {
      filter.popularwork = "1";
    }
    else if ($('#radiotop select.composers option:checked').val() == "pop") {
      filter.popularcomposer = "1";
    }
    else {
      filter.composer = $('#radiotop select.composers option:checked').val();
    }
    conc_newradio(filter);
  }
  else {
    conc_radioqueue = [];
    conc_radiofilter = {};
    conc_onair = false;
    $('#radiotop select').prop("disabled", false);
  }
}

// playlist radio

conc_playlistradio = function (where) {

  if (conc_disabled) {
    $(`#${conc_disabledreason}`).leanModal(); return;
  }

  var performances = $(where).children().get();
  var pids = [];

  for (p in performances) {
    pids[p] = $(performances[p]).attr("pid");
  }

  if (pids.length)
  {
    for (let i = pids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pids[i], pids[j]] = [pids[j], pids[i]];
    }

    conc_onair = true;
    conc_radioqueue = pids;
    conc_radiofilter = { type: 'playlist' };

    if (!$('#tuning-modal').is(':visible')) { $('#tuning-modal').leanModal(); }

    $('#radiotop #goradio').removeClass('on');
    $('#radiotop #goradio').addClass('on');

    $('#playercontrols #skip').removeClass('radio');
    $('#playercontrols #skip').addClass('radio');

    $('#radiotop select').prop("disabled", true);

    var thisrec = pids.shift();
    thisrec = thisrec.split("-");
    conc_recording (thisrec[0], thisrec[1], thisrec[2]);
  }
}

// permalink

conc_permalink = function (wid, aid, set) {
  $('#sharedialog').show();
  $('#shareconfirm').hide();

  $.ajax({
    url: conc_options.backend + '/recording/shorturl/work/' + wid + '/album/' + aid + '/' + set + '.json',
    method: "GET",
    success: function (response) {
      permauri = conc_options.shareurl + '/r/' + (Number(response.recording.id)).toString(16);
      $('#permalink-direct').val(permauri);
      $('#permalink-widget').text(`<iframe src="${permauri}/widget" width="593" height="430" frameborder="0"></iframe>`);
      $('#permalink-modal').leanModal();
    }
  });
}

conc_linkcopy = function (obj) {
  fobj = $(`#permalink-${obj}`);
  fobj.select();
  document.execCommand("copy");
  $('#sharedialog').hide();
  $('#shareconfirm').show();
}

// refreshing the composer list

conc_refreshcomposers = function () {
  if ($('#composers li.index').hasClass('all')) {
    conc_composersbyname('all');
  }
  else if ($('#composers li.index').hasClass('favorite')) {
    conc_composersbyfav();
  }
  else if ($('#composers li.index').hasClass('period')) {
    conc_composersbyepoch($('#library .periods').val());
  }
  else {
    conc_composersbyname($('#composers li.index').html());
  }
}

// album pagination by scrolling

conc_albumscroll = function (o) {
  if (o.offsetHeight + o.scrollTop > o.scrollHeight - 400) {
    if (window.albumlistnext) {
      if (window.albumlistnext != window.albumlistoffset) {
        conc_recordingsbywork(window.albumlistwork, window.albumlistnext);
      }
    }
  }
}

// recording tagging

conc_qualify = function () {
  $('#playerverify').toggleClass('opened');
}