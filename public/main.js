/* global navigator, m, window, document, AudioContext, createAudioMeter, Recorder */
'use strict';
/*
The MIT License (MIT)

Copyright (c) 2014 Chris Wilson

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
var audioContext = null;
var meter = null;
var canvasContext = null;
var WIDTH=500;
var HEIGHT=50;
var rafID = null;

window.onload = function() {
    m.module(document.getElementById('app'), ctrl)
    // grab our canvas
	canvasContext = document.getElementById( 'meter' ).getContext('2d');
	
    // monkeypatch Web Audio
    window.AudioContext = window.AudioContext || window.webkitAudioContext;
	
    // grab an audio context
    audioContext = new AudioContext();

    // Attempt to get audio input
    try {
        // monkeypatch getUserMedia
        navigator.getUserMedia = 
        	navigator.getUserMedia ||
        	navigator.webkitGetUserMedia ||
        	navigator.mozGetUserMedia;

        // ask for an audio input
        navigator.getUserMedia(
            {
                audio: {
                    mandatory: {
                        googEchoCancellation: false,
                        googAutoGainControl: false,
                        googNoiseSuppression: false,
                        googHighpassFilter: false
                    },
                    optional: []
                }
            }, gotStream, didntGetStream);
    } catch (e) {
        didntGetStream();
    }
};

function didntGetStream() {
    m.startComputation();
    ctrl.vm.alertText('Couldn\'t get stream! Maybe you are not on Chrome or Firefox. Safari doesn\'t have the audio support. :( ');
    ctrl.vm.alertType('danger');
    m.endComputation();
}

var mediaStreamSource = null;
var rec;

function gotStream(stream) {
    ctrl.vm.alertText(null);
    ctrl.vm.alertType('primary');

    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Create a new volume meter and connect it.
    meter = createAudioMeter(audioContext);
    mediaStreamSource.connect(meter);

    rec = new Recorder(mediaStreamSource, {
        workerPath: '/lib/recorderjs/recorderWorker.js'
    });

    drawLoop();
}

var recordStart = 0;
function startRecording(time){
    console.log('record.start', time);
    recording = true;
    recordStart = time;
    rec.record();
}

function stopRecording(time){
    console.log('record.stop', time - recordStart);

    if(rec){
        rec.stop();
        recording = false;
        rec.getBuffer(function(buffers){
            var source = audioContext.createBufferSource();
            source.buffer = audioContext.createBuffer(1, buffers[0].length, audioContext.sampleRate);
            source.buffer.getChannelData(0).set(buffers[0]);
            source.buffer.getChannelData(0).set(buffers[1]);
            source.connect(audioContext.destination);
            source.onended = function(ev){
                console.log('playback done', silentFrames);
                playingBack = false;
            };
            console.log('playback start', silentFrames);
            source.start(0);
            playingBack = true;
            rec.clear();
        });
    }
}

// mithril stuff
var ctrl = {};
var volumeIncrement = 0.05;

ctrl.vm = {
    init: function(){
        ctrl.vm.delayFrameLength = m.prop(500);
        ctrl.vm.silenceFramesLength = m.prop(500);
        ctrl.vm.volumeThreshold = m.prop(0.05);
        ctrl.vm.recordingStatusGlyph = m.prop('glyphicon');
        ctrl.vm.recordingStatus = m.prop('Starting');
        ctrl.vm.recordingPanelBackground = m.prop('');
        ctrl.vm.alertText = m.prop('You have to allow access to the microphone for this to work');
        ctrl.vm.alertType = m.prop('warning');
        ctrl.vm.controlSpec = [{
            name: 'sens',
            label: 'Sensitivity',
            binding: ctrl.vm.volumeThreshold,
            quantum: 0.05,
            min: 0.00,
            max: 1
        },{
            name: 'quiet',
            label: 'Quiet Period (ms)',
            binding: ctrl.vm.silenceFramesLength,
            quantum: 20,
            min: 10,
            max: 1000
        },{
            name: 'restart',
            label: 'Restart Wait (ms)',
            binding: ctrl.vm.delayFrameLength,
            quantum: 20,
            min: 10,
            max: 1000
        }];
        ctrl.vm.incrementFun = function(binding, quantum, max){
            return function(){
                var current = binding();
                if((typeof max !== 'undefined') || current<max){
                    binding(Number(Number(current + quantum).toFixed(2)));
                }
            };
        };
        ctrl.vm.decrementFun = function(binding, quantum, min){
            return function(){
                var current = binding();
                if((typeof min !== 'undefined') || current>min){
                    binding(Number(Number(current - quantum).toFixed(2)));
                }
            };
        };
    }
};
ctrl.controller = function(){
    ctrl.vm.init();
};

ctrl.view = function(){
    return m('div', {class: 'container'}, [
        m('h1', {class: 'page-header'}, 'Practice Echo'),
        m('div', {class: 'row ' + (ctrl.vm.alertText() ? 'show' : 'hidden')}, [
            m('div', {class: 'col-md-12'}, [
                m('div', {class: 'alert alert-' + ctrl.vm.alertType()}, ctrl.vm.alertText())
            ])
        ]),
        m('div', {class: 'row'}, [
            m('div', {class: 'col-md-4'}, [
                ctrl.view.status(ctrl.vm.recordingStatusGlyph, ctrl.vm.recordingStatus)
            ]),
            m('div', {class: 'col-md-8'}, [
                ctrl.view.canvas()
            ])
        ]),
        m('div', {class: 'row'}, [                
            ctrl.view.controls()
        ]),
        m('div', {class: 'row'}, [
            m('div', {class: 'col-md-12'}, [
                m('div', {class: 'well'}, [
                    m('p','This page will listen to you and play back any sounds you make.'),
                    m('p','After playback is done, there is a small delay before recording can start again.'),
                    m('p','Recording will start automatically when the level gets high enough.')
                ])
            ])
        ]),
        m('div', {class: 'row'}, [
            m('div', {class: 'col-md-12'}, [
                m('p',m.trust('Copyright &copy; 2015 Chris Whatley - '), [
                    m('a', {href: 'https://github.com/cwhatley/practice-echo'}, 'github')
                ])
            ])
        ])
    ]);
};

ctrl.view.canvas = function(){
    return m('div', {class: 'panel panel-default'}, [
        m('div', {class: 'panel-heading'}, [
            m('h3', {class: 'panel-title'}, 'Audio Level')
        ]),
        m('div', {class: 'panel-body'}, [
            m('canvas', {id: 'meter', width:500, height:'40'})
        ])
    ]);
};

ctrl.view.status = function(){
    return m('div', {class: 'panel panel-default'}, [
        m('div', {class: 'panel-heading'}, [
            m('h3', {class: 'panel-title'}, 'Recording Status')
        ]),
        m('div', {class: ['panel-body', ctrl.vm.recordingPanelBackground()].join(' ') }, [
            m('div', {class: 'btn btn-lg'}, [
                m('span', {id: 'recordingStatus', class: ctrl.vm.recordingStatusGlyph() }, ' '),
                m('span', ctrl.vm.recordingStatus())
            ])
        ])
    ]);
};

ctrl.view.controls = function(){
    var value = [];
    ctrl.vm.controlSpec.forEach(function(ob){
        value.push(m('div[class=col-md-4]',[
            m('div', {class: 'input-group'},[
			    m('label', {class: 'input-group-addon',id: 'basic-addon1', for: ob.name}, ob.label),
			    m('input', {name: ob.name, oninput: m.withAttr('value', ob.binding), type: 'text', class: 'form-control',value: ob.binding()}),
			    m('span', {class: 'input-group-btn'}, [
				    m('button', {class:'btn btn-default',type: 'button', onclick: ctrl.vm.decrementFun(ob.binding, ob.quantum, ob.min)}, '-')
                ]),
			    m('span', {class: 'input-group-btn'}, [
				    m('button', {class: 'btn btn-default',type: 'button', onclick: ctrl.vm.incrementFun(ob.binding, ob.quantum, ob.max)}, '+')
                ])
            ])
        ]));
    });
    return m('div', {class: 'col-md-12'},[
        m('div', {class: 'panel panel-default'}, [
            m('div', {class: 'panel-heading'}, [
                m('h3', {class: 'panel-title'}, 'Controls')
            ]),
            m('div', {class: 'panel-body' }, [
                m('form', {class: 'form-inline'}, [
                    m('div', {class: 'form-group'}, [
                        value
                    ])
                ])
            ])
        ])
    ]);
};

//m.module(document.getElementById('controls'), ctrl);

//var readyToRecord = true;
var playingBack = false;
var recording = false;
var silentFrames = 0;
var startDelayFrameCount = 0;
var delaying = false;
var isSilence = false;

function updateStatusSpan(){
    m.startComputation();
    var status = 'UNKNOWN';
    if(playingBack){
        status = 'music';
    } else if(recording){
        status = 'record';
    } else if (delaying){
        status = 'pause';
    } else {
        status = 'ok';
    }
    ctrl.vm.recordingStatusGlyph('glyphicon glyphicon-lg glyphicon-' + status);
    ctrl.vm.recordingStatus({
        music: 'Playing Back',
        record: 'Recording',
        pause: 'Hold On',
        ok: 'Listening'
    }[status]);
    ctrl.vm.recordingPanelBackground({
        music: 'bg-primary',
        record: 'bg-danger',
        pause: 'bg-warning',
        ok: 'bg-success'
    }[status]);
    m.endComputation();
}

var lastDraw;

function calcMillisecondsSinceLastDraw(time){
    var val = 0;
    if((typeof time) !== 'undefined'){
        if((typeof lastDraw) === 'undefined'){
            lastDraw = time;
        } else {
            val = time - lastDraw;
            lastDraw = time;
        }
    }
    return val;
}

function drawLoop( time ) {
    var millisecondsSinceLastDraw = calcMillisecondsSinceLastDraw(time);

    var silentNow = (meter.volume < ctrl.vm.volumeThreshold());
    if(silentNow){
        silentFrames += millisecondsSinceLastDraw;
    } else {
        silentFrames = 0;
    }

    isSilence = (silentFrames > ctrl.vm.silenceFramesLength());

    if(!playingBack){
        delaying = (ctrl.vm.delayFrameLength() > startDelayFrameCount);
        startDelayFrameCount += millisecondsSinceLastDraw;
        if(!delaying){
            //console.log('delay over', isSilence);
            if(isSilence){
                if(recording){
                    stopRecording(time);
                    startDelayFrameCount = 0;
                }
            } else {
                if(!recording){
                    startRecording(time);
                }
            }
        } else {
            silentFrames = ctrl.vm.silenceFramesLength()+1;
        }
    } else {
        silentFrames = 0;
    }
    updateStatusSpan();
    
    // clear the background
    canvasContext.clearRect(0,0,WIDTH,HEIGHT);

    // check if we're currently clipping
    if (meter.checkClipping())
        canvasContext.fillStyle = 'red';
    else
        canvasContext.fillStyle = 'green';

    // draw a bar based on the current volume
    canvasContext.fillRect(0, 0, meter.volume*WIDTH*1.4, HEIGHT);

    // set up the next visual callback
    rafID = window.requestAnimationFrame( drawLoop );
}


