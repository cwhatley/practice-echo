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
var statusSpan;

window.onload = function() {
    // grab our canvas
	canvasContext = document.getElementById( "meter" ).getContext("2d");
    statusSpan = document.getElementById("recordingStatus");
	
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
            "audio": {
                "mandatory": {
                    "googEchoCancellation": "true",
                    "googAutoGainControl": "false",
                    "googNoiseSuppression": "false",
                    "googHighpassFilter": "false"
                },
                "optional": []
            },
        }, gotStream, didntGetStream);
    } catch (e) {
        alert('getUserMedia threw exception :' + e);
    }
};

function didntGetStream() {
    alert('Stream generation failed.');
}

var mediaStreamSource = null;
var rec;

function gotStream(stream) {
    // Create an AudioNode from the stream.
    mediaStreamSource = audioContext.createMediaStreamSource(stream);

    // Create a new volume meter and connect it.
    meter = createAudioMeter(audioContext);
    mediaStreamSource.connect(meter);

    rec = new Recorder(mediaStreamSource, {
        workerPath: '/lib/recorderjs/recorderWorker.js'
    });

    // kick off the visual updating
//    startRecording();
    drawLoop();
}

function startRecording(){
    console.log('record.start', silentFrames);
    recording = true;
    rec.record();
}

function stopRecording(){
    console.log('record.stop', silentFrames);
//    readyToRecord = false;
    if(rec){
        rec.stop();
        recording = false;
        rec.getBuffer(function(buffers){
            var source = audioContext.createBufferSource();
            source.buffer = audioContext.createBuffer(1, buffers[0].length, 44100);
            source.buffer.getChannelData(0).set(buffers[0]);
            source.buffer.getChannelData(0).set(buffers[1]);
            source.connect(audioContext.destination);
            source.onended = function(ev){
                console.log('playback done', silentFrames);
//                readyToRecord = true;
                playingBack = false;
            };
            console.log('playback start', silentFrames);
            source.start(0);
            playingBack = true;
            rec.clear();
        });
    }
}

//var readyToRecord = true;
var playingBack = false;
var recording = false;
var silentFrames = 0;
var startDelayFrameCount = 0;
var delaying = false;
var isSilence = false;

var delayFrameLength = 50;
var silenceFramesLength = 100;
var volumeThreshold = 0.05;


function updateStatusSpan(){
    var status = 'UNKNOWN';
    if(playingBack){
        status = 'playing back';
    } else if(recording){
        status = 'recording';
    } else if (delaying){
        status = 'pausing';
    } else {
        status = 'ready';
    }
    statusSpan.innerHTML = status;
}

function drawLoop( time ) {
    var silentNow = (meter.volume < volumeThreshold);
    if(silentNow){
        silentFrames++;
    } else {
        silentFrames = 0;
    }

    isSilence = (silentFrames > silenceFramesLength);

    if(!playingBack){
        delaying = (delayFrameLength > startDelayFrameCount++);
        if(!delaying){
            //console.log('delay over', isSilence);
            if(isSilence){
                if(recording){
                    stopRecording();
                    startDelayFrameCount = 0;
                }
            } else {
                if(!recording){
                    startRecording();
                }
            }
        } else {
            silentFrames = 201;
        }
    } else {
        silentFrames = 0;
    }
    updateStatusSpan();
    
    // clear the background
    canvasContext.clearRect(0,0,WIDTH,HEIGHT);

    // check if we're currently clipping
    if (meter.checkClipping())
        canvasContext.fillStyle = "red";
    else
        canvasContext.fillStyle = "green";

    // draw a bar based on the current volume
    canvasContext.fillRect(0, 0, meter.volume*WIDTH*1.4, HEIGHT);

    // set up the next visual callback
    rafID = window.requestAnimationFrame( drawLoop );
}


