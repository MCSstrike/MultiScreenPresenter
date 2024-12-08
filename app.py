import eventlet
eventlet.monkey_patch()

from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import time


app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins='*')

# Store latest frame and last activity time for each stream
streams = {}
INACTIVITY_TIMEOUT = 30  # seconds of inactivity before removing a stream

# Dictionary to hold current selected stream per viewer
current_streams = {
    "viewer1": None,
    "viewer2": None
}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/broadcast')
def broadcast():
    return render_template('broadcast.html')


@app.route('/view1')
def view1():
    return render_template('view1.html')


@app.route('/view2')
def view2():
    return render_template('view2.html')


@app.route('/control')
def control():
    return render_template('control.html')


@socketio.on('frame')
def handle_frame(data):
    # Expect data: {streamName, dataURL}
    stream_name = data.get('streamName', 'UnnamedStream')
    dataURL = data.get('dataURL')

    streams[stream_name] = {
        'dataURL': dataURL,
        'lastFrameTime': time.time()
    }

    # For each viewer, if this stream is currently selected for them, broadcast
    for viewer_id, sel_stream in current_streams.items():
        if sel_stream == stream_name:
            emit('frame_' + viewer_id, {'streamName': stream_name, 'dataURL': dataURL}, broadcast=True,
                 include_self=False)


@socketio.on('request_stream_list')
def handle_request_stream_list():
    remove_inactive_streams()
    emit('stream_list', list(streams.keys()))


@socketio.on('select_stream_for_viewer')
def handle_select_stream_for_viewer(data):
    # data: {viewer_id: "viewer1" or "viewer2", streamName: "someStream"}
    viewer_id = data.get('viewer_id')
    selected = data.get('streamName')
    if viewer_id not in current_streams:
        return  # Invalid viewer_id
    if selected in streams:
        current_streams[viewer_id] = selected
    else:
        current_streams[viewer_id] = None

    # Notify that this viewer's selection changed
    emit('selected_stream_' + viewer_id, current_streams[viewer_id], broadcast=True)


@socketio.on('request_current_stream')
def handle_request_current_stream(data):
    # data: {viewer_id: "viewer1" or "viewer2"}
    viewer_id = data.get('viewer_id')
    if viewer_id in current_streams:
        emit('current_stream_' + viewer_id, current_streams[viewer_id])
    else:
        emit('current_stream_' + viewer_id, None)


def remove_inactive_streams():
    now = time.time()
    inactive_streams = [name for name, info in streams.items() if now - info['lastFrameTime'] > INACTIVITY_TIMEOUT]
    for s in inactive_streams:
        del streams[s]


if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', port=5000)
