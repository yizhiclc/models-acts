(function () {
    var root = "C:/Users/Administrator/Documents/Codex/2026-09-11/html-blackhole-1-three-js-2/outputs/altar-film/edit";
    var finalPath = new File(root + "/BlackHoleAltar_Finished.prproj").fsName;
    var exportPath = new File(root + "/BlackHoleAltar_1080p60.mp4").fsName;
    var log = new File(root + "/premiere-finished-status.txt");
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
                var result = findMedia(item.children[i], path);
                if (result) {
                    return result;
                }
            }
        }
        return null;
    }
    function importMedia(path, bin) {
        if (!new File(path).exists) {
            throw new Error("Required asset missing: " + path);
        }
        if (!app.project.importFiles([path], true, bin, false)) {
            throw new Error("Native import failed: " + path);
        }
        var item = findMedia(app.project.rootItem, path);
        if (!item || item.isOffline()) {
            throw new Error("Imported media is offline: " + path);
        }
        report("ONLINE: " + path);
        return item;
    }
    function fadeOpacity(clip, inputStart, inputEnd, fadeIn, fadeOut) {
        for (var i = 0; i < clip.components.numItems; i++) {
            var component = clip.components[i];
            if (component.matchName.indexOf("Opacity") < 0 &&
                    component.displayName !== "Opacity" &&
                    component.displayName !== "\u4e0d\u900f\u660e\u5ea6") {
                continue;
            }
            var opacity = component.properties[0];
            if (!opacity.areKeyframesSupported()) {
                return false;
            }
            opacity.setTimeVarying(true);
            var points = [[inputStart, 0], [inputStart + fadeIn, 100],
                          [inputEnd - fadeOut, 100], [inputEnd, 0]];
            for (var j = 0; j < points.length; j++) {
                var key = time(points[j][0]);
                opacity.addKey(key);
                opacity.setValueAtKey(key, points[j][1], false);
            }
            return true;
        }
        return false;
    }
    function checkTrack(track, label) {
        for (var i = 0; i < track.clips.numItems; i++) {
            var clip = track.clips[i];
            if (clip.projectItem.isOffline()) {
                throw new Error(label + " contains offline media.");
            }
            report(label + " clip " + (i + 1) + ": " + clip.name +
                   " | start=" + clip.start.seconds + " | end=" + clip.end.seconds);
        }
    }
    try {
        $.evalFile(root + "/scripts/premiere-edit-plan.jsx");
        var plan = ALTAR_EDIT_PLAN;
        if (new File(finalPath).exists || new File(exportPath).exists) {
            throw new Error("Final output exists; refusing to overwrite it.");
        }
        report("Opening linked baseline.");
        if (!app.openDocument(new File(root + "/BlackHoleAltar_Linked.prproj").fsName, true, true, true, true)) {
            throw new Error("Cannot open linked baseline.");
        }
        app.project.saveAs(finalPath);
        report("Native project path: " + app.project.path);
        var sequence = app.project.activeSequence || app.project.sequences[0];
        if (!sequence) {
            throw new Error("No editable sequence.");
        }
        sequence.name = "BlackHole Altar - Finished Film - 1080p60";
        var bin = app.project.rootItem.createBin("Film Graphics and Music");
        var graphics = importMedia(root + "/assets/construction_graphics_alpha.mov", bin);
        var music = importMedia(root + "/assets/Eventide_Altar_music.wav", bin);
        var title = importMedia(root + "/assets/opening-title.png", bin);
        // Keep editable subtitle text as an alternative, without double-burning captions.
        app.project.importFiles([root + "/assets/components_zh.srt"], true, bin, false);
        report("Graphics, score, title, and subtitle source imported.");
        if (sequence.videoTracks.numTracks < 3 || sequence.audioTracks.numTracks < 2) {
            throw new Error("The baseline does not have the expected free video/audio tracks.");
        }
        for (var i = 0; i < plan.stages.length; i++) {
            var stage = plan.stages[i];
            graphics.setInPoint(stage.startSeconds, 1);
            graphics.setOutPoint(stage.endSeconds, 1);
            sequence.videoTracks[1].overwriteClip(graphics, time(stage.startSeconds).ticks);
            var clip = sequence.videoTracks[1].clips[i];
            clip.inPoint = time(stage.startSeconds);
            clip.outPoint = time(stage.endSeconds);
            clip.start = time(stage.startSeconds);
            clip.end = time(stage.endSeconds);
            clip.name = ("0" + stage.index).slice(-2) + " | " + stage.title;
        }
        graphics.clearInPoint();
        graphics.clearOutPoint();
        music.setInPoint(0, 2);
        music.setOutPoint(plan.durationSeconds, 2);
        sequence.audioTracks[1].overwriteClip(music, "0");
        var musicClip = sequence.audioTracks[1].clips[0];
        musicClip.start = time(0);
        musicClip.end = time(plan.durationSeconds);
        title.setInPoint(0, 1);
        title.setOutPoint(6, 1);
        sequence.videoTracks[2].overwriteClip(title, "0");
        var titleClip = sequence.videoTracks[2].clips[0];
        titleClip.start = time(0);
        titleClip.end = time(6);
        titleClip.inPoint = time(0);
        titleClip.outPoint = time(6);
        report("Title opacity fade: " + fadeOpacity(titleClip, 0, 6, .65, .8));
        var footageClip = sequence.videoTracks[0].clips[0];
        report("Source opacity fade: " +
               fadeOpacity(footageClip, plan.sourceInSeconds, plan.sourceOutSeconds, .8, 1.5));
        app.project.openSequence(sequence.sequenceID);
        sequence.setPlayerPosition(time(140).ticks);
        checkTrack(sequence.videoTracks[0], "V1 Footage");
        checkTrack(sequence.videoTracks[1], "V2 Components and progress");
        checkTrack(sequence.videoTracks[2], "V3 Opening title");
        checkTrack(sequence.audioTracks[1], "A2 Score");
        app.project.save();
        report("SAVED: " + app.project.path);
        report("Sequence duration ticks: " + sequence.end);
        report("EXPORT START: " + exportPath);
        var preset = new File(root + "/Altar_1080p60_H264.epr").fsName;
        var exportResult = sequence.exportAsMediaDirect(
            exportPath, preset, app.encoder.ENCODE_ENTIRE
        );
        report("Export returned: " + exportResult);
        var exported = new File(exportPath);
        report("Export exists: " + exported.exists);
        if (!exported.exists || exported.length < 1000000) {
            throw new Error("Export did not create a substantial video file.");
        }
        app.project.save();
        report("COMPLETE: Finished project saved and video exported through Premiere Pro.");
    } catch (error) {
        report("ERROR: " + error.toString());
        report("LINE: " + error.line);
        try {
            if (app.project && app.project.path === finalPath) {
                app.project.save();
            }
        } catch (saveError) {
            report("Save recovery: " + saveError.toString());
        }
    }
}());
