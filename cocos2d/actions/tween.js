
let TweenAction = cc.Class({
    name: 'cc.TweenAction',
    extends: cc.ActionInterval,

    ctor (duration, props, opts) {
        this._opts = opts = opts || Object.create(null);
        this._props = Object.create(null);

        // global easing or progress used for this action
        opts.progress = opts.progress || this.progress;
        if (opts.easing && typeof opts.easing === 'string') {
            let easingName = opts.easing;
            opts.easing = cc.easing[easingName];
            !opts.easing && cc.warnID(1031, easingName);
        }

        let relative = this._opts.relative;

        for (let name in props) {
            let value = props[name];

            // property may have custom easing or progress function
            let easing, progress;
            if (value.value !== undefined && (value.easing || value.progress)) {
                if (typeof value.easing === 'string') {
                    easing = cc.easing[value.easing];
                    !easing && cc.warnID(1031, value.easing);
                }
                else {
                    easing = value.easing;
                }
                progress = value.progress;
                value = value.value;
            }

            let isNumber = typeof value === 'number';
            if (!isNumber && (!value.lerp || (relative && !value.add && !value.mul) || !value.clone)) {
                cc.warn(`Can not animate ${name} property, because it do not have [lerp, (add|mul), clone] function.`);
                continue;
            }

            let prop = Object.create(null);
            prop.value = value;
            prop.easing = easing;
            prop.progress = progress;
            this._props[name] = prop;
        }

        this._originProps = props;
        this.initWithDuration(duration);
    },

    clone () {
        var action = new TweenAction(this._duration, this._originProps, this._opts);
        this._cloneDecoration(action);
        return action;
    },

    startWithTarget (target) {
        cc.ActionInterval.prototype.startWithTarget.call(this, target);

        let relative = !!this._opts.relative;
        let props = this._props;
        for (let name in props) {
            let value = target[name];
            let prop = props[name];

            if (typeof value === 'number') {
                prop.start = value;
                prop.current = value;
                prop.end = relative ? value + prop.value : prop.value;
            }
            else {
                prop.start = value.clone();
                prop.current = value.clone();
                prop.end = relative ? (value.add || value.mul).call(value, prop.value) : prop.value;
            }
        }
    },

    update (t) {
        let opts = this._opts;
        let easingTime = t;
        if (opts.easing) easingTime = opts.easing(t);

        let target = this.target;
        if (!target) return;

        let props = this._props;
        let progress = this._opts.progress;
        for (let name in props) {
            let prop = props[name];
            let time = prop.easing ? prop.easing(t) : easingTime;
            let current = prop.current = (prop.progress || progress)(prop.start, prop.end, prop.current, time);
            target[name] = current;
        }
    },

    progress (start, end, current, t) {
        if (typeof start === 'number') {
            current = start + (end - start) * t;
        }
        else {
            start.lerp(end, t, current);
        }
        return current;
    }
});

let SetAction = cc.Class({
    name: 'cc.SetAction',
    extends: cc.ActionInstant,

    ctor (props) {
        this._props = {};
        props !== undefined && this.init(props);
    },

    init (props) {
        for (let name in props) {
            this._props[name] = props[name];
        }
        return true;
    },

    update () {
        let props = this._props;
        let target = this.target;
        for (let name in props) {
            target[name] = props[name];
        }
    },

    clone () {
        var action = new SetAction();
        action.init(this._props);
        return action;
    }
});



/**
 * !#en
 * Tween provide a simple and flexible way to create action.
 * Tween's api is more flexible than cc.Action:
 *  - Support creating an action sequence in chained api,
 *  - Support animate any objects' any properties, not limited to node's properties.
 *    By contrast, cc.Action needs to create a new action class to support new node property.
 *  - Support working with cc.Action,
 *  - Support easing and progress function.
 * !#zh
 * Tween ????????????????????????????????????????????? action???
 * ????????? Cocos ????????? cc.Action???cc.Tween ???????????????????????????????????????
 *  - ?????????????????????????????????????????????????????????
 *  - ?????????????????????????????????????????????????????????????????????????????????????????? cc.Action ????????????????????????????????????????????????????????? action ?????????
 *  - ????????? cc.Action ??????
 *  - ???????????? {{#crossLink "Easing"}}{{/crossLink}} ?????? progress ??????
 * @class Tween
 * @example
 * cc.tween(node)
 *   .to(1, {scale: 2, position: cc.v3(100, 100, 100)})
 *   .call(() => { console.log('This is a callback'); })
 *   .by(1, {scale: 3, position: cc.v3(200, 200, 200)}, {easing: 'sineOutIn'})
 *   .run(cc.find('Canvas/cocos'));
 */
function Tween (target) {
    this._actions = [];
    this._finalAction = null;
    this._target = target;
}

/**
 * !#en
 * Insert an action or tween to this sequence
 * !#zh
 * ???????????? action ?????? tween ????????????
 * @method then 
 * @param {Action|Tween} other
 * @return {Tween}
 */
Tween.prototype.then = function (other) {
    if (other instanceof cc.Action) {
        this._actions.push(other.clone());
    }
    else {
        this._actions.push(other._union());
    }
    return this;
};


/**
 * !#en
 * Set tween target
 * !#zh
 * ?????? tween ??? target
 * @method target
 * @param {Object} target
 * @return {Tween}
 */
Tween.prototype.target = function (target) {
    this._target = target;
    return this;
};

/**
 * !#en
 * Start this tween
 * !#zh
 * ???????????? tween
 * @method start
 * @return {Tween}
 */
Tween.prototype.start = function () {
    if (!this._target) {
        cc.warn('Please set target to tween first');
        return this;
    }
    if (this._finalAction) {
        cc.director.getActionManager().removeAction(this._finalAction);
    }
    this._finalAction = this._union();
    cc.director.getActionManager().addAction(this._finalAction, this._target, false);
    return this;
};

/**
 * !#en
 * Stop this tween
 * !#zh
 * ???????????? tween
 * @method stop
 * @return {Tween}
 */
Tween.prototype.stop = function () {
    if (this._finalAction) {
        cc.director.getActionManager().removeAction(this._finalAction);
    }
    return this;
};



/**
 * !#en
 * Clone a tween
 * !#zh
 * ???????????? tween
 * @method clone
 * @param {Object} [target]
 * @return {Tween}
 */
Tween.prototype.clone = function (target) {
    let action = this._union();
    return cc.tween(target).then(action.clone());
};

/**
 * !#en
 * Integrate all previous actions to an action.
 * !#zh
 * ?????????????????? action ??????????????? action???
 * @return {Tween}
 */
Tween.prototype.union = function () {
    let action = this._union();
    this._actions.length = 0;
    this._actions.push(action);
    return this;
};

Tween.prototype._union = function () {
    let actions = this._actions;

    if (actions.length === 1) {
        actions = actions[0];
    }
    else {
        actions = cc.sequence(actions);
    }

    return actions;
};

let tmp_args = [];

function wrapAction (action) {
    return function () {
        tmp_args.length = 0;
        for (let l = arguments.length, i = 0; i < l; i++) {
            let arg = tmp_args[i] = arguments[i];
            if (arg instanceof Tween) {
                tmp_args[i] = arg._union();
            }
        }

        return action.apply(this, tmp_args);
    };
}

let actions = {
    /**
     * !#en
     * Add an action which calculate with absolute value
     * !#zh
     * ????????????????????????????????????????????? action
     * @method to
     * @param {Number} duration 
     * @param {Object} props - {scale: 2, position: cc.v3(100, 100, 100)}
     * @param {Object} opts 
     * @param {Function} opts.progress
     * @param {Function|String} opts.easing
     * @return {Tween}
     */
    to (duration, props, opts) {
        opts = opts || Object.create(null);
        opts.relative = false;
        return new TweenAction(duration, props, opts);
    },

    /**
     * !#en
     * Add an action which calculate with relative value
     * !#zh
     * ????????????????????????????????????????????? action
     * @method by
     * @param {Number} duration 
     * @param {Object} props - {scale: 2, position: cc.v3(100, 100, 100)}
     * @param {Object} opts 
     * @param {Function} opts.progress
     * @param {Function|String} opts.easing
     * @return {Tween}
     */
    by (duration, props, opts) {
        opts = opts || Object.create(null);
        opts.relative = true;
        return new TweenAction(duration, props, opts);
    },

    /**
     * !#en
     * Directly set target properties
     * !#zh
     * ???????????? target ?????????
     * @method set
     * @param {Object} props
     * @return {Tween}
     */
    set (props) {
        return new SetAction(props);
    },

    /**
     * !#en
     * Add an delay action
     * !#zh
     * ?????????????????? action
     * @method delay
     * @param {Number} duration 
     * @return {Tween}
     */
    delay: cc.delayTime,
    /**
     * !#en
     * Add an callback action
     * !#zh
     * ?????????????????? action
     * @method call
     * @param {Function} callback
     * @return {Tween}
     */
    call: cc.callFunc,
    /**
     * !#en
     * Add an hide action
     * !#zh
     * ?????????????????? action
     * @method hide
     * @return {Tween}
     */
    hide: cc.hide,
    /**
     * !#en
     * Add an show action
     * !#zh
     * ?????????????????? action
     * @method show
     * @return {Tween}
     */
    show: cc.show,
    /**
     * !#en
     * Add an removeSelf action
     * !#zh
     * ???????????????????????? action
     * @method removeSelf
     * @return {Tween}
     */
    removeSelf: cc.removeSelf,
    /**
     * !#en
     * Add an sequence action
     * !#zh
     * ?????????????????? action
     * @method sequence
     * @param {[Action|Tween]} actions
     * @return {Tween}
     */
    sequence: wrapAction(cc.sequence),
    /**
     * !#en
     * Add an parallel action
     * !#zh
     * ?????????????????? action
     * @method parallel
     * @param {[Action|Tween]} actions
     * @return {Tween}
     */
    parallel: wrapAction(cc.spawn)
};

// these action will use previous action as their parameters
let previousAsInputActions = {
    /**
     * !#en
     * Add an repeat action. 
     * This action will integrate before actions to a sequence action as their parameters.
     * !#zh
     * ?????????????????? action????????? action ??????????????????????????????????????????
     * @method repeat
     * @param {Number} repeatTimes 
     * @param {Action|Tween} [action]
     * @return {Tween}
     */
    repeat: cc.repeat,
    /**
     * !#en
     * Add an repeat forever action
     * This action will integrate before actions to a sequence action as their parameters.
     * !#zh
     * ???????????????????????? action????????? action ??????????????????????????????????????????
     * @method repeatForever
     * @param {Action|Tween} [action]
     * @return {Tween}
     */
    repeatForever: cc.repeatForever,
    /**
     * !#en
     * Add an reverse time action.
     * This action will integrate before actions to a sequence action as their parameters.
     * !#zh
     * ???????????????????????? action????????? action ??????????????????????????????????????????
     * @method reverseTime
     * @param {Action|Tween} [action]
     * @return {Tween}
     */
    reverseTime: cc.reverseTime,
};


let keys = Object.keys(actions);
for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    Tween.prototype[key] = function () {
        let action = actions[key].apply(actions, arguments);
        this._actions.push(action);
        return this;
    };
}

keys = Object.keys(previousAsInputActions);
for (let i = 0; i < keys.length; i++) {
    let key = keys[i];
    Tween.prototype[key] = function () {

        let actions = this._actions;
        let action = arguments[arguments.length - 1];
        let length = arguments.length - 1;

        if (action instanceof cc.Tween) {
            action = action._union();
        }
        else if (!(action instanceof cc.Action)) {
            action = actions[actions.length - 1];
            actions.length -= 1;
            length += 1;
        }

        let args = [action];
        for (let i = 0; i < length; i++) {
            args.push(arguments[i]);
        }

        action = previousAsInputActions[key].apply(this, args);
        actions.push(action);

        return this;
    };
}

/**
 * @method tween
 * @param {Object} [target] - the target to animate
 * @return {Tween}
 */
cc.tween = function (target) {
    return new Tween(target);
};

cc.Tween = Tween;
