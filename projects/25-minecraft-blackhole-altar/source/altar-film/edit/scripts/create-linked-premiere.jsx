(function () {
    var root = "C:/Users/Administrator/Documents/Codex/2026-09-11/html-blackhole-1-three-js-2/outputs/altar-film/edit";
    var projectPath = root + "/BlackHoleAltar_Linked.prproj";
    var log = new File(root + "/premiere-linked-status.txt");
    log.encoding = "UTF-8";
    log.open("w");
    log.close();
    function report(message) {
        log.open("a");
        log.writeln(message);
        log.close();
    }
    function time(seconds) {
        var value = new Time();
        value.seconds = seconds;
        return value;
    }
    function findMedia(item, path) {
        if (item.type !== ProjectItemType.BIN && item.getMediaPath &&
                item.getMediaPath().replace(/\\/g, "/").toLowerCase() === path.toLowerCase()) {
            return item;
        }
        if (item.children) {
            for (var i = 0; i < item.children.numItems; i++) {
                var found = findMedia(item.children[i], path);
                if (found) {
                    return found;
                }
            }
        }
        return null;
    }
    try {
        $.evalFile(root + "/scripts/premiere-edit-plan.jsx");
        var plan = ALTAR_EDIT_PLAN;
        var sourcePath = root + "/source_recording.mp4";
        report("Premiere: " + app.version);
        if (!new File(sourcePath).exists) {
            throw new Error("Compatible source does not exist.");
        }
        if (new File(projectPath).exists) {
            throw new Error("Linked project already exists; refusing to overwrite it.");
        }
        if (!app.newProject(projectPath)) {
            throw new Error("Cannot create linked project.");
        }
        report("Created project.");
        var imported = app.project.importFiles([sourcePath], true, app.project.rootItem, false);
        report("Native MP4 import returned: " + imported);
        var source = findMedia(app.project.rootItem, sourcePath);
        if (!source) {
            throw new Error("Imported source item was not found.");
        }
        report("Source path: " + source.getMediaPath());
        report("Source offline: " + source.isOffline());
        if (source.isOffline()) {
            throw new Error("Native source is still offline.");
        }
        source.setInPoint(plan.sourceInSeconds, 4);
        source.setOutPoint(plan.sourceOutSeconds, 4);
        var sequence = app.project.createNewSequenceFromClips(
            "BlackHole Altar - Edit - 1080p60", [source], app.project.rootItem
        );
        if (!sequence) {
            throw new Error("Could not create sequence from native source.");
        }
        report("Created native sequence.");
        var tracks = [sequence.videoTracks, sequence.audioTracks];
        for (var group = 0; group < tracks.length; group++) {
            for (var track = 0; track < tracks[group].numTracks; track++) {
                var clips = tracks[group][track].clips;
                for (var i = 0; i < clips.numItems; i++) {
                    clips[i].inPoint = time(plan.sourceInSeconds);
                    clips[i].outPoint = time(plan.sourceOutSeconds);
                    clips[i].start = time(0);
                    clips[i].end = time(plan.durationSeconds);
                }
            }
        }
        for (var j = 0; j < plan.stages.length; j++) {
            var stage = plan.stages[j];
            var marker = sequence.markers.createMarker(stage.startSeconds);
            marker.name = ("0" + stage.index).slice(-2) + " | " + stage.title;
            marker.comments = stage.english + "; source-log aligned; original speed.";
            marker.end = stage.endSeconds;
        }
        app.project.openSequence(sequence.sequenceID);
        sequence.setPlayerPosition(time(180).ticks);
        app.project.save();
        report("Saved: " + app.project.path);
        var clip = sequence.videoTracks[0].clips[0];
        report("Video sourceIn: " + clip.inPoint.seconds);
        report("Video sourceOut: " + clip.outPoint.seconds);
        report("Video start: " + clip.start.seconds);
        report("Video end: " + clip.end.seconds);
        var settings = sequence.getSettings();
        report("Dimensions: " + settings.videoFrameWidth + "x" + settings.videoFrameHeight);
        report("Frame duration: " + settings.videoFrameRate.seconds);
        report("Video tracks: " + sequence.videoTracks.numTracks);
        report("Audio tracks: " + sequence.audioTracks.numTracks);
        report("Markers: " + sequence.markers.numMarkers);
        report("COMPLETE: Native source is online and linked project is saved.");
    } catch (error) {
        report("ERROR: " + error.toString());
        report("LINE: " + error.line);
    }
}());
