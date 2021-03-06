/****************************************************************************
 Copyright (c) 2008-2010 Ricardo Quesada
 Copyright (c) 2011-2012 cocos2d-x.org
 Copyright (c) 2013-2016 Chukong Technologies Inc.
 Copyright (c) 2017-2018 Xiamen Yaji Software Co., Ltd.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/

const EventTarget = require('./event/event-target');
const AutoReleaseUtils = require('./load-pipeline/auto-release-utils');
const ComponentScheduler = require('./component-scheduler');
const NodeActivator = require('./node-activator');
const Obj = require('./platform/CCObject');
const game = require('./CCGame');
const renderer = require('./renderer');
const eventManager = require('./event-manager');
const Scheduler = require('./CCScheduler');

//----------------------------------------------------------------------------------------------------------------------

/**
 * !#en
 * <p>
 *    ATTENTION: USE cc.director INSTEAD OF cc.Director.<br/>
 *    cc.director is a singleton object which manage your game's logic flow.<br/>
 *    Since the cc.director is a singleton, you don't need to call any constructor or create functions,<br/>
 *    the standard way to use it is by calling:<br/>
 *      - cc.director.methodName(); <br/>
 *
 *    It creates and handle the main Window and manages how and when to execute the Scenes.<br/>
 *    <br/>
 *    The cc.director is also responsible for:<br/>
 *      - initializing the OpenGL context<br/>
 *      - setting the OpenGL pixel format (default on is RGB565)<br/>
 *      - setting the OpenGL buffer depth (default on is 0-bit)<br/>
 *      - setting the color for clear screen (default one is BLACK)<br/>
 *      - setting the projection (default one is 3D)<br/>
 *      - setting the orientation (default one is Portrait)<br/>
 *      <br/>
 *    <br/>
 *    The cc.director also sets the default OpenGL context:<br/>
 *      - GL_TEXTURE_2D is enabled<br/>
 *      - GL_VERTEX_ARRAY is enabled<br/>
 *      - GL_COLOR_ARRAY is enabled<br/>
 *      - GL_TEXTURE_COORD_ARRAY is enabled<br/>
 * </p>
 * <p>
 *   cc.director also synchronizes timers with the refresh rate of the display.<br/>
 *   Features and Limitations:<br/>
 *      - Scheduled timers & drawing are synchronizes with the refresh rate of the display<br/>
 *      - Only supports animation intervals of 1/60 1/30 & 1/15<br/>
 * </p>
 *
 * !#zh
 * <p>
 *     ???????????? cc.director ?????? cc.Director???<br/>
 *     cc.director ?????????????????????????????????????????????????????????<br/>
 *     ?????? cc.director ????????????????????????????????????????????????????????????????????????<br/>
 *     ??????????????????????????????????????????<br/>
 *       - cc.director.methodName();
 *     <br/>
 *     ??????????????????????????????????????????????????????????????????<br/>
 *     <br/>
 *     cc.director ????????????<br/>
 *      - ????????? OpenGL ?????????<br/>
 *      - ??????OpenGL???????????????(????????? RGB565)<br/>
 *      - ??????OpenGL??????????????? (????????? 0-bit)<br/>
 *      - ??????????????????????????? (????????? ??????)<br/>
 *      - ???????????? (????????? 3D)<br/>
 *      - ???????????? (????????? Portrait)<br/>
 *    <br/>
 *    cc.director ????????? OpenGL ???????????? <br/>
 *      - GL_TEXTURE_2D   ?????????<br/>
 *      - GL_VERTEX_ARRAY ?????????<br/>
 *      - GL_COLOR_ARRAY  ?????????<br/>
 *      - GL_TEXTURE_COORD_ARRAY ?????????<br/>
 * </p>
 * <p>
 *   cc.director ????????????????????????????????????????????????
 *   <br/>
 *   ??????????????????: <br/>
 *      - ???????????? & ??????????????????????????????????????????<br/>
 *      - ???????????????????????? 1/60 1/30 & 1/15???<br/>
 * </p>
 *
 * @class Director
 * @extends EventTarget
 */
cc.Director = function () {
    EventTarget.call(this);

    // paused?
    this._paused = false;
    // purge?
    this._purgeDirectorInNextLoop = false;

    this._winSizeInPoints = null;

    // scenes
    this._loadingScene = '';
    this._scene = null;

    // FPS
    this._totalFrames = 0;
    this._lastUpdate = 0;
    this._deltaTime = 0.0;

    // Scheduler for user registration update
    this._scheduler = null;
    // Scheduler for life-cycle methods in component
    this._compScheduler = null;
    // Node activator
    this._nodeActivator = null;
    // Action manager
    this._actionManager = null;

    var self = this;
    game.on(game.EVENT_SHOW, function () {
        self._lastUpdate = performance.now();
    });

    game.once(game.EVENT_ENGINE_INITED, this.init, this);
};

cc.Director.prototype = {
    constructor: cc.Director,
    init: function () {
        this._totalFrames = 0;
        this._lastUpdate = performance.now();
        this._paused = false;
        this._purgeDirectorInNextLoop = false;
        this._winSizeInPoints = cc.size(0, 0);
        this._scheduler = new Scheduler();

        if (cc.ActionManager) {
            this._actionManager = new cc.ActionManager();
            this._scheduler.scheduleUpdate(this._actionManager, Scheduler.PRIORITY_SYSTEM, false);
        } else {
            this._actionManager = null;
        }

        this.sharedInit();
        return true;
    },

    /*
     * Manage all init process shared between the web engine and jsb engine.
     * All platform independent init process should be occupied here.
     */
    sharedInit: function () {
        this._compScheduler = new ComponentScheduler();
        this._nodeActivator = new NodeActivator();

        // Event manager
        if (eventManager) {
            eventManager.setEnabled(true);
        }

        // Animation manager
        if (cc.AnimationManager) {
            this._animationManager = new cc.AnimationManager();
            this._scheduler.scheduleUpdate(this._animationManager, Scheduler.PRIORITY_SYSTEM, false);
        }
        else {
            this._animationManager = null;
        }

        // collision manager
        if (cc.CollisionManager) {
            this._collisionManager = new cc.CollisionManager();
            this._scheduler.scheduleUpdate(this._collisionManager, Scheduler.PRIORITY_SYSTEM, false);
        }
        else {
            this._collisionManager = null;
        }

        // physics manager
        if (cc.PhysicsManager) {
            this._physicsManager = new cc.PhysicsManager();
            this._scheduler.scheduleUpdate(this._physicsManager, Scheduler.PRIORITY_SYSTEM, false);
        }
        else {
            this._physicsManager = null;
        }

        // WidgetManager
        if (cc._widgetManager) {
            cc._widgetManager.init(this);
        }

        cc.loader.init(this);
    },

    /**
     * calculates delta time since last time it was called
     */
    calculateDeltaTime: function (now) {
        if (!now) now = performance.now();
        this._deltaTime = (now - this._lastUpdate) / 1000;
        if (CC_DEBUG && (this._deltaTime > 1))
            this._deltaTime = 1 / 60.0;

        this._lastUpdate = now;
    },

    /**
     * !#en
     * Converts a view coordinate to an WebGL coordinate<br/>
     * Useful to convert (multi) touches coordinates to the current layout (portrait or landscape)<br/>
     * Implementation can be found in CCDirectorWebGL.
     * !#zh ???????????????????????????????????? WebGL View ???????????????
     * @method convertToGL
     * @param {Vec2} uiPoint
     * @return {Vec2}
     * @deprecated since v2.0
     */
    convertToGL: function (uiPoint) {
        var container = game.container;
        var view = cc.view;
        var box = container.getBoundingClientRect();
        var left = box.left + window.pageXOffset - container.clientLeft;
        var top = box.top + window.pageYOffset - container.clientTop;
        var x = view._devicePixelRatio * (uiPoint.x - left);
        var y = view._devicePixelRatio * (top + box.height - uiPoint.y);
        return view._isRotated ? cc.v2(view._viewportRect.width - y, x) : cc.v2(x, y);
    },

    /**
     * !#en
     * Converts an OpenGL coordinate to a view coordinate<br/>
     * Useful to convert node points to window points for calls such as glScissor<br/>
     * Implementation can be found in CCDirectorWebGL.
     * !#zh ??????????????? WebGL View ??????????????????????????????
     * @method convertToUI
     * @param {Vec2} glPoint
     * @return {Vec2}
     * @deprecated since v2.0
     */
    convertToUI: function (glPoint) {
        var container = game.container;
        var view = cc.view;
        var box = container.getBoundingClientRect();
        var left = box.left + window.pageXOffset - container.clientLeft;
        var top = box.top + window.pageYOffset - container.clientTop;
        var uiPoint = cc.v2(0, 0);
        if (view._isRotated) {
            uiPoint.x = left + glPoint.y / view._devicePixelRatio;
            uiPoint.y = top + box.height - (view._viewportRect.width - glPoint.x) / view._devicePixelRatio;
        }
        else {
            uiPoint.x = left + glPoint.x * view._devicePixelRatio;
            uiPoint.y = top + box.height - glPoint.y * view._devicePixelRatio;
        }
        return uiPoint;
    },

    /**
     * End the life of director in the next frame
     * @method end
     */
    end: function () {
        this._purgeDirectorInNextLoop = true;
    },

    /**
     * !#en
     * Returns the size of the WebGL view in points.<br/>
     * It takes into account any possible rotation (device orientation) of the window.
     * !#zh ??????????????????????????????????????????
     * @method getWinSize
     * @return {Size}
     * @deprecated since v2.0
     */
    getWinSize: function () {
        return cc.size(cc.winSize);
    },

    /**
     * !#en
     * Returns the size of the OpenGL view in pixels.<br/>
     * It takes into account any possible rotation (device orientation) of the window.<br/>
     * On Mac winSize and winSizeInPixels return the same value.
     * (The pixel here refers to the resource resolution. If you want to get the physics resolution of device, you need to use cc.view.getFrameSize())
     * !#zh
     * ????????????????????????????????????????????????????????????????????????????????????
     * ???????????????????????????????????????????????? cc.view.getFrameSize()???
     * @method getWinSizeInPixels
     * @return {Size}
     * @deprecated since v2.0
     */
    getWinSizeInPixels: function () {
        return cc.size(cc.winSize);
    },

    /**
     * !#en Pause the director's ticker, only involve the game logic execution.
     * It won't pause the rendering process nor the event manager.
     * If you want to pause the entier game including rendering, audio and event, 
     * please use {{#crossLink "Game.pause"}}cc.game.pause{{/crossLink}}
     * !#zh ??????????????????????????????????????????????????????????????????????????????????????????????????? UI ?????????
     * ????????????????????????????????????????????????????????????????????????????????? {{#crossLink "Game.pause"}}cc.game.pause{{/crossLink}}???
     * @method pause
     */
    pause: function () {
        if (this._paused)
            return;
        this._paused = true;
    },

    /**
     * Removes cached all cocos2d cached data.
     * @deprecated since v2.0
     */
    purgeCachedData: function () {
        cc.loader.releaseAll();
    },

    /**
     * Purge the cc.director itself, including unschedule all schedule, remove all event listeners, clean up and exit the running scene, stops all animations, clear cached data.
     */
    purgeDirector: function () {
        //cleanup scheduler
        this._scheduler.unscheduleAll();
        this._compScheduler.unscheduleAll();

        this._nodeActivator.reset();

        // Disable event dispatching
        if (eventManager)
            eventManager.setEnabled(false);

        if (!CC_EDITOR) {
            if (cc.isValid(this._scene)) {
                this._scene.destroy();
            }
            this._scene = null;

            cc.renderer.clear();
            cc.AssetLibrary.resetBuiltins();
        }

        cc.game.pause();

        // Clear all caches
        cc.loader.releaseAll();
    },

    /**
     * Reset the cc.director, can be used to restart the director after purge
     */
    reset: function () {
        this.purgeDirector();

        if (eventManager)
            eventManager.setEnabled(true);

        // Action manager
        if (this._actionManager){
            this._scheduler.scheduleUpdate(this._actionManager, cc.Scheduler.PRIORITY_SYSTEM, false);
        }

        // Animation manager
        if (this._animationManager) {
            this._scheduler.scheduleUpdate(this._animationManager, cc.Scheduler.PRIORITY_SYSTEM, false);
        }

        // Collider manager
        if (this._collisionManager) {
            this._scheduler.scheduleUpdate(this._collisionManager, cc.Scheduler.PRIORITY_SYSTEM, false);
        }

        // Physics manager
        if (this._physicsManager) {
            this._scheduler.scheduleUpdate(this._physicsManager, cc.Scheduler.PRIORITY_SYSTEM, false);
        }

        cc.game.resume();
    },

    /**
     * !#en
     * Run a scene. Replaces the running scene with a new one or enter the first scene.<br/>
     * The new scene will be launched immediately.
     * !#zh ???????????????????????????
     * @method runSceneImmediate
     * @param {Scene} scene - The need run scene.
     * @param {Function} [onBeforeLoadScene] - The function invoked at the scene before loading.
     * @param {Function} [onLaunched] - The function invoked at the scene after launch.
     */
    runSceneImmediate: function (scene, onBeforeLoadScene, onLaunched) {
        cc.assertID(scene instanceof cc.Scene, 1216);

        CC_BUILD && CC_DEBUG && console.time('InitScene');
        scene._load();  // ensure scene initialized
        CC_BUILD && CC_DEBUG && console.timeEnd('InitScene');

        // Re-attach or replace persist nodes
        CC_BUILD && CC_DEBUG && console.time('AttachPersist');
        var persistNodeList = Object.keys(game._persistRootNodes).map(function (x) {
            return game._persistRootNodes[x];
        });
        for (let i = 0; i < persistNodeList.length; i++) {
            let node = persistNodeList[i];
            var existNode = scene.getChildByUuid(node.uuid);
            if (existNode) {
                // scene also contains the persist node, select the old one
                var index = existNode.getSiblingIndex();
                existNode._destroyImmediate();
                scene.insertChild(node, index);
            }
            else {
                node.parent = scene;
            }
        }
        CC_BUILD && CC_DEBUG && console.timeEnd('AttachPersist');

        var oldScene = this._scene;
        if (!CC_EDITOR) {
            // auto release assets
            CC_BUILD && CC_DEBUG && console.time('AutoRelease');
            var autoReleaseAssets = oldScene && oldScene.autoReleaseAssets && oldScene.dependAssets;
            AutoReleaseUtils.autoRelease(autoReleaseAssets, scene.dependAssets, persistNodeList);
            CC_BUILD && CC_DEBUG && console.timeEnd('AutoRelease');
        }

        // unload scene
        CC_BUILD && CC_DEBUG && console.time('Destroy');
        if (cc.isValid(oldScene)) {
            oldScene.destroy();
        }

        this._scene = null;

        // purge destroyed nodes belongs to old scene
        Obj._deferredDestroy();
        CC_BUILD && CC_DEBUG && console.timeEnd('Destroy');

        if (onBeforeLoadScene) {
            onBeforeLoadScene();
        }
        this.emit(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, scene);

        // Run an Entity Scene
        this._scene = scene;

        CC_BUILD && CC_DEBUG && console.time('Activate');
        scene._activate();
        CC_BUILD && CC_DEBUG && console.timeEnd('Activate');

        //start scene
        cc.game.resume();

        if (onLaunched) {
            onLaunched(null, scene);
        }
        this.emit(cc.Director.EVENT_AFTER_SCENE_LAUNCH, scene);
    },

    /**
     * !#en
     * Run a scene. Replaces the running scene with a new one or enter the first scene.
     * The new scene will be launched at the end of the current frame.
     * !#zh ?????????????????????
     * @method runScene
     * @param {Scene} scene - The need run scene.
     * @param {Function} [onBeforeLoadScene] - The function invoked at the scene before loading.
     * @param {Function} [onLaunched] - The function invoked at the scene after launch.
     * @private
     */
    runScene: function (scene, onBeforeLoadScene, onLaunched) {
        cc.assertID(scene, 1205);
        cc.assertID(scene instanceof cc.Scene, 1216);

        // ensure scene initialized
        scene._load();

        // Delay run / replace scene to the end of the frame
        this.once(cc.Director.EVENT_AFTER_UPDATE, function () {
            this.runSceneImmediate(scene, onBeforeLoadScene, onLaunched);
        }, this);
    },

    //  @Scene loading section

    _getSceneUuid: function (key) {
        var scenes = game._sceneInfos;
        if (typeof key === 'string') {
            if (!key.endsWith('.fire')) {
                key += '.fire';
            }
            if (key[0] !== '/' && !key.startsWith('db://')) {
                key = '/' + key;    // ??????????????????
            }
            // search scene
            for (var i = 0; i < scenes.length; i++) {
                var info = scenes[i];
                if (info.url.endsWith(key)) {
                    return info;
                }
            }
        }
        else if (typeof key === 'number') {
            if (0 <= key && key < scenes.length) {
                return scenes[key];
            }
            else {
                cc.errorID(1206, key);
            }
        }
        else {
            cc.errorID(1207, key);
        }
        return null;
    },

    /**
     * !#en Loads the scene by its name.
     * !#zh ???????????????????????????????????????
     *
     * @method loadScene
     * @param {String} sceneName - The name of the scene to load.
     * @param {Function} [onLaunched] - callback, will be called after scene launched.
     * @return {Boolean} if error, return false
     */
    loadScene: function (sceneName, onLaunched, _onUnloaded) {
        if (this._loadingScene) {
            cc.errorID(1208, sceneName, this._loadingScene);
            return false;
        }
        var info = this._getSceneUuid(sceneName);
        if (info) {
            var uuid = info.uuid;
            this.emit(cc.Director.EVENT_BEFORE_SCENE_LOADING, sceneName);
            this._loadingScene = sceneName;
            this._loadSceneByUuid(uuid, onLaunched, _onUnloaded);
            return true;
        }
        else {
            cc.errorID(1209, sceneName);
            return false;
        }
    },

    /**
     * !#en
     * Preloads the scene to reduces loading time. You can call this method at any time you want.
     * After calling this method, you still need to launch the scene by `cc.director.loadScene`.
     * It will be totally fine to call `cc.director.loadScene` at any time even if the preloading is not
     * yet finished, the scene will be launched after loaded automatically.
     * !#zh ???????????????????????????????????????????????????????????????
     * ???????????????????????????????????? `cc.director.loadScene` ?????????????????????????????????????????????????????????????????????
     * ?????????????????????????????????????????????????????? `cc.director.loadScene`???????????????????????????????????????
     *
     * @method preloadScene
     * @param {String} sceneName - The name of the scene to preload.
     * @param {Function} [onProgress] - callback, will be called when the load progression change.
     * @param {Number} onProgress.completedCount - The number of the items that are already completed
     * @param {Number} onProgress.totalCount - The total number of the items
     * @param {Object} onProgress.item - The latest item which flow out the pipeline
     * @param {Function} [onLoaded] - callback, will be called after scene loaded.
     * @param {Error} onLoaded.error - null or the error object.
     * @param {cc.SceneAsset} onLoaded.asset - The scene asset itself.
     */
    preloadScene: function (sceneName, onProgress, onLoaded) {
        if (onLoaded === undefined) {
            onLoaded = onProgress;
            onProgress = null;
        }

        var info = this._getSceneUuid(sceneName);
        if (info) {
            this.emit(cc.Director.EVENT_BEFORE_SCENE_LOADING, sceneName);
            cc.loader.load({ uuid: info.uuid, type: 'uuid' }, 
                onProgress,    
                function (error, asset) {
                    if (error) {
                        cc.errorID(1210, sceneName, error.message);
                    }
                    if (onLoaded) {
                        onLoaded(error, asset);
                    }
                });       
        }
        else {
            var error = 'Can not preload the scene "' + sceneName + '" because it is not in the build settings.';
            onLoaded(new Error(error));
            cc.error('preloadScene: ' + error);
        }
    },

    /**
     * Loads the scene by its uuid.
     * @method _loadSceneByUuid
     * @param {String} uuid - the uuid of the scene asset to load
     * @param {Function} [onLaunched]
     * @param {Function} [onUnloaded]
     * @param {Boolean} [dontRunScene] - Just download and initialize the scene but will not launch it,
     *                                   only take effect in the Editor.
     * @private
     */
    _loadSceneByUuid: function (uuid, onLaunched, onUnloaded, dontRunScene) {
        if (CC_EDITOR) {
            if (typeof onLaunched === 'boolean') {
                dontRunScene = onLaunched;
                onLaunched = null;
            }
            if (typeof onUnloaded === 'boolean') {
                dontRunScene = onUnloaded;
                onUnloaded = null;
            }
        }
        //cc.AssetLibrary.unloadAsset(uuid);     // force reload
        console.time('LoadScene ' + uuid);
        cc.AssetLibrary.loadAsset(uuid, function (error, sceneAsset) {
            console.timeEnd('LoadScene ' + uuid);
            var self = cc.director;
            self._loadingScene = '';
            if (error) {
                error = 'Failed to load scene: ' + error;
                cc.error(error);
            }
            else {
                if (sceneAsset instanceof cc.SceneAsset) {
                    var scene = sceneAsset.scene;
                    scene._id = sceneAsset._uuid;
                    scene._name = sceneAsset._name;
                    if (CC_EDITOR) {
                        if (!dontRunScene) {
                            self.runSceneImmediate(scene, onUnloaded, onLaunched);
                        }
                        else {
                            scene._load();
                            if (onLaunched) {
                                onLaunched(null, scene);
                            }
                        }
                    }
                    else {
                        self.runSceneImmediate(scene, onUnloaded, onLaunched);
                    }
                    return;
                }
                else {
                    error = 'The asset ' + uuid + ' is not a scene';
                    cc.error(error);
                }
            }
            if (onLaunched) {
                onLaunched(error);
            }
        });
    },

    /**
     * !#en Resume game logic execution after pause, if the current scene is not paused, nothing will happen.
     * !#zh ?????????????????????????????????????????????????????????????????????????????????????????????
     * @method resume
     */
    resume: function () {
        if (!this._paused) {
            return;
        }

        this._lastUpdate = performance.now();
        if (!this._lastUpdate) {
            cc.logID(1200);
        }

        this._paused = false;
        this._deltaTime = 0;
    },

    /**
     * !#en
     * Enables or disables WebGL depth test.<br/>
     * Implementation can be found in CCDirectorCanvas.js/CCDirectorWebGL.js
     * !#zh ??????/???????????????????????? Canvas ?????????????????????????????????
     * @method setDepthTest
     * @param {Boolean} on
     * @deprecated since v2.0
     */
    setDepthTest: function (value) {
        if (!cc.Camera.main) {
            return;
        }
        cc.Camera.main.depth = !!value;
    },

    /**
     * !#en
     * Set color for clear screen.<br/>
     * (Implementation can be found in CCDirectorCanvas.js/CCDirectorWebGL.js)
     * !#zh
     * ????????????????????????????????????<br/>
     * ??????????????????????????????????????????????????????????????????????????????????????? cc.macro.ENABLE_TRANSPARENT_CANVAS???
     * @method setClearColor
     * @param {Color} clearColor
     * @deprecated since v2.0
     */
    setClearColor: function (clearColor) {
        if (!cc.Camera.main) {
            return;
        }
        cc.Camera.main.backgroundColor = clearColor;
    },

    /**
     * !#en Returns current logic Scene.
     * !#zh ???????????????????????????
     * @method getRunningScene
     * @private
     * @return {Scene}
     * @deprecated since v2.0
     */
    getRunningScene: function () {
        return this._scene;
    },

    /**
     * !#en Returns current logic Scene.
     * !#zh ???????????????????????????
     * @method getScene
     * @return {Scene}
     * @example
     *  // This will help you to get the Canvas node in scene
     *  cc.director.getScene().getChildByName('Canvas');
     */
    getScene: function () {
        return this._scene;
    },

    /**
     * !#en Returns the FPS value. Please use {{#crossLink "Game.setFrameRate"}}cc.game.setFrameRate{{/crossLink}} to control animation interval.
     * !#zh ??????????????????????????????????????? {{#crossLink "Game.setFrameRate"}}cc.game.setFrameRate{{/crossLink}} ????????????????????????
     * @method getAnimationInterval
     * @deprecated since v2.0
     * @return {Number}
     */
    getAnimationInterval: function () {
        return 1000 / game.getFrameRate();
    },

    /**
     * Sets animation interval, this doesn't control the main loop.
     * To control the game's frame rate overall, please use {{#crossLink "Game.setFrameRate"}}cc.game.setFrameRate{{/crossLink}}
     * @method setAnimationInterval
     * @deprecated since v2.0
     * @param {Number} value - The animation interval desired.
     */
    setAnimationInterval: function (value) {
        game.setFrameRate(Math.round(1000 / value));
    },

    /**
     * !#en Returns the delta time since last frame.
     * !#zh ?????????????????????????????????
     * @method getDeltaTime
     * @return {Number}
     */
    getDeltaTime: function () {
        return this._deltaTime;
    },

    /**
     * !#en Returns how many frames were called since the director started.
     * !#zh ?????? director ???????????????????????????????????????
     * @method getTotalFrames
     * @return {Number}
     */
    getTotalFrames: function () {
        return this._totalFrames;
    },

    /**
     * !#en Returns whether or not the Director is paused.
     * !#zh ???????????????????????????
     * @method isPaused
     * @return {Boolean}
     */
    isPaused: function () {
        return this._paused;
    },

    /**
     * !#en Returns the cc.Scheduler associated with this director.
     * !#zh ????????? director ???????????? cc.Scheduler???
     * @method getScheduler
     * @return {Scheduler}
     */
    getScheduler: function () {
        return this._scheduler;
    },

    /**
     * !#en Sets the cc.Scheduler associated with this director.
     * !#zh ????????? director ???????????? cc.Scheduler???
     * @method setScheduler
     * @param {Scheduler} scheduler
     */
    setScheduler: function (scheduler) {
        if (this._scheduler !== scheduler) {
            this._scheduler = scheduler;
        }
    },

    /**
     * !#en Returns the cc.ActionManager associated with this director.
     * !#zh ????????? director ???????????? cc.ActionManager????????????????????????
     * @method getActionManager
     * @return {ActionManager}
     */
    getActionManager: function () {
        return this._actionManager;
    },
    /**
     * !#en Sets the cc.ActionManager associated with this director.
     * !#zh ????????? director ???????????? cc.ActionManager????????????????????????
     * @method setActionManager
     * @param {ActionManager} actionManager
     */
    setActionManager: function (actionManager) {
        if (this._actionManager !== actionManager) {
            if (this._actionManager) {
                this._scheduler.unscheduleUpdate(this._actionManager);
            }
            this._actionManager = actionManager;
            this._scheduler.scheduleUpdate(this._actionManager, cc.Scheduler.PRIORITY_SYSTEM, false);
        }
    },

    /* 
     * !#en Returns the cc.AnimationManager associated with this director.
     * !#zh ????????? director ???????????? cc.AnimationManager????????????????????????
     * @method getAnimationManager
     * @return {AnimationManager}
     */
    getAnimationManager: function () {
        return this._animationManager;
    },

    /**
     * !#en Returns the cc.CollisionManager associated with this director.
     * !#zh ????????? director ???????????? cc.CollisionManager ????????????????????????
     * @method getCollisionManager
     * @return {CollisionManager}
     */
    getCollisionManager: function () {
        return this._collisionManager;
    },

    /**
     * !#en Returns the cc.PhysicsManager associated with this director.
     * !#zh ????????? director ???????????? cc.PhysicsManager ????????????????????????
     * @method getPhysicsManager
     * @return {PhysicsManager}
     */
    getPhysicsManager: function () {
        return this._physicsManager;
    },

    // Loop management
    /*
     * Starts Animation
     * @deprecated since v2.1.2
     */
    startAnimation: function () {
        cc.game.resume();
    },

    /*
     * Stops animation
     * @deprecated since v2.1.2
     */
    stopAnimation: function () {
        cc.game.pause();
    },

    _resetDeltaTime () {
        this._lastUpdate = performance.now();
        this._deltaTime = 0;
    },

    /*
     * Run main loop of director
     */
    mainLoop: CC_EDITOR ? function (deltaTime, updateAnimate) {
        this._deltaTime = deltaTime;

        // Update
        if (!this._paused) {
            this.emit(cc.Director.EVENT_BEFORE_UPDATE);

            this._compScheduler.startPhase();
            this._compScheduler.updatePhase(deltaTime);

            if (updateAnimate) {
                this._scheduler.update(deltaTime);
            }

            this._compScheduler.lateUpdatePhase(deltaTime);

            this.emit(cc.Director.EVENT_AFTER_UPDATE);
        }

        // Render
        this.emit(cc.Director.EVENT_BEFORE_DRAW);
        renderer.render(this._scene);
        
        // After draw
        this.emit(cc.Director.EVENT_AFTER_DRAW);

        this._totalFrames++;

    } : function (now) {
        if (this._purgeDirectorInNextLoop) {
            this._purgeDirectorInNextLoop = false;
            this.purgeDirector();
        }
        else {
            // calculate "global" dt
            this.calculateDeltaTime(now);

            // Update
            if (!this._paused) {
                this.emit(cc.Director.EVENT_BEFORE_UPDATE);
                // Call start for new added components
                this._compScheduler.startPhase();
                // Update for components
                this._compScheduler.updatePhase(this._deltaTime);
                // Engine update with scheduler
                this._scheduler.update(this._deltaTime);
                // Late update for components
                this._compScheduler.lateUpdatePhase(this._deltaTime);
                // User can use this event to do things after update
                this.emit(cc.Director.EVENT_AFTER_UPDATE);
                // Destroy entities that have been removed recently
                Obj._deferredDestroy();
            }

            // Render
            this.emit(cc.Director.EVENT_BEFORE_DRAW);
            renderer.render(this._scene);

            // After draw
            this.emit(cc.Director.EVENT_AFTER_DRAW);

            eventManager.frameUpdateListeners();
            this._totalFrames++;
        }
    },

    __fastOn: function (type, callback, target) {
        this.add(type, callback, target);
    },

    __fastOff: function (type, callback, target) {
        this.remove(type, callback, target);
    },
};

// Event target
cc.js.addon(cc.Director.prototype, EventTarget.prototype);

/**
 * !#en The event projection changed of cc.Director. This event will not get triggered since v2.0
 * !#zh cc.Director ??????????????????????????? v2.0 ????????????????????????????????????
 * @property {String} EVENT_PROJECTION_CHANGED
 * @readonly
 * @static
 * @deprecated since v2.0
 */
cc.Director.EVENT_PROJECTION_CHANGED = "director_projection_changed";

/**
 * !#en The event which will be triggered before loading a new scene.
 * !#zh ??????????????????????????????????????????
 * @event cc.Director.EVENT_BEFORE_SCENE_LOADING
 * @param {String} sceneName - The loading scene name
 */
/**
 * !#en The event which will be triggered before loading a new scene.
 * !#zh ??????????????????????????????????????????
 * @property {String} EVENT_BEFORE_SCENE_LOADING
 * @readonly
 * @static
 */
cc.Director.EVENT_BEFORE_SCENE_LOADING = "director_before_scene_loading";

/*
 * !#en The event which will be triggered before launching a new scene.
 * !#zh ??????????????????????????????????????????
 * @event cc.Director.EVENT_BEFORE_SCENE_LAUNCH
 * @param {String} sceneName - New scene which will be launched
 */
/**
 * !#en The event which will be triggered before launching a new scene.
 * !#zh ??????????????????????????????????????????
 * @property {String} EVENT_BEFORE_SCENE_LAUNCH
 * @readonly
 * @static
 */
cc.Director.EVENT_BEFORE_SCENE_LAUNCH = "director_before_scene_launch";

/**
 * !#en The event which will be triggered after launching a new scene.
 * !#zh ??????????????????????????????????????????
 * @event cc.Director.EVENT_AFTER_SCENE_LAUNCH
 * @param {String} sceneName - New scene which is launched
 */
/**
 * !#en The event which will be triggered after launching a new scene.
 * !#zh ??????????????????????????????????????????
 * @property {String} EVENT_AFTER_SCENE_LAUNCH
 * @readonly
 * @static
 */
cc.Director.EVENT_AFTER_SCENE_LAUNCH = "director_after_scene_launch";

/**
 * !#en The event which will be triggered at the beginning of every frame.
 * !#zh ??????????????????????????????????????????
 * @event cc.Director.EVENT_BEFORE_UPDATE
 */
/**
 * !#en The event which will be triggered at the beginning of every frame.
 * !#zh ??????????????????????????????????????????
 * @property {String} EVENT_BEFORE_UPDATE
 * @readonly
 * @static
 */
cc.Director.EVENT_BEFORE_UPDATE = "director_before_update";

/**
 * !#en The event which will be triggered after engine and components update logic.
 * !#zh ????????????????????? ???update??? ?????????????????????????????????
 * @event cc.Director.EVENT_AFTER_UPDATE
 */
/**
 * !#en The event which will be triggered after engine and components update logic.
 * !#zh ????????????????????? ???update??? ?????????????????????????????????
 * @property {String} EVENT_AFTER_UPDATE
 * @readonly
 * @static
 */
cc.Director.EVENT_AFTER_UPDATE = "director_after_update";

/**
 * !#en The event is deprecated since v2.0, please use cc.Director.EVENT_BEFORE_DRAW instead
 * !#zh ??????????????? v2.0 ????????????????????????????????? cc.Director.EVENT_BEFORE_DRAW
 * @property {String} EVENT_BEFORE_VISIT
 * @readonly
 * @deprecated since v2.0
 * @static
 */
cc.Director.EVENT_BEFORE_VISIT = "director_before_draw";

/**
 * !#en The event is deprecated since v2.0, please use cc.Director.EVENT_BEFORE_DRAW instead
 * !#zh ??????????????? v2.0 ????????????????????????????????? cc.Director.EVENT_BEFORE_DRAW
 * @property {String} EVENT_AFTER_VISIT
 * @readonly
 * @deprecated since v2.0
 * @static
 */
cc.Director.EVENT_AFTER_VISIT = "director_before_draw";

/**
 * !#en The event which will be triggered before the rendering process.
 * !#zh ???????????????????????????????????????
 * @event cc.Director.EVENT_BEFORE_DRAW
 */
/**
 * !#en The event which will be triggered before the rendering process.
 * !#zh ???????????????????????????????????????
 * @property {String} EVENT_BEFORE_DRAW
 * @readonly
 * @static
 */
cc.Director.EVENT_BEFORE_DRAW = "director_before_draw";

/**
 * !#en The event which will be triggered after the rendering process.
 * !#zh ???????????????????????????????????????
 * @event cc.Director.EVENT_AFTER_DRAW
 */
/**
 * !#en The event which will be triggered after the rendering process.
 * !#zh ???????????????????????????????????????
 * @property {String} EVENT_AFTER_DRAW
 * @readonly
 * @static
 */
cc.Director.EVENT_AFTER_DRAW = "director_after_draw";

//Possible OpenGL projections used by director

/**
 * Constant for 2D projection (orthogonal projection)
 * @property {Number} PROJECTION_2D
 * @default 0
 * @readonly
 * @static
 * @deprecated since v2.0
 */
cc.Director.PROJECTION_2D = 0;

/**
 * Constant for 3D projection with a fovy=60, znear=0.5f and zfar=1500.
 * @property {Number} PROJECTION_3D
 * @default 1
 * @readonly
 * @static
 * @deprecated since v2.0
 */
cc.Director.PROJECTION_3D = 1;

/**
 * Constant for custom projection, if cc.Director's projection set to it, it calls "updateProjection" on the projection delegate.
 * @property {Number} PROJECTION_CUSTOM
 * @default 3
 * @readonly
 * @static
 * @deprecated since v2.0
 */
cc.Director.PROJECTION_CUSTOM = 3;

/**
 * Constant for default projection of cc.Director, default projection is 2D projection
 * @property {Number} PROJECTION_DEFAULT
 * @default cc.Director.PROJECTION_2D
 * @readonly
 * @static
 * @deprecated since v2.0
 */
cc.Director.PROJECTION_DEFAULT = cc.Director.PROJECTION_2D;

/**
 * @module cc
 */

/**
 * !#en Director
 * !#zh ????????????
 * @property director
 * @type {Director}
 */
cc.director = new cc.Director();

module.exports = cc.director;