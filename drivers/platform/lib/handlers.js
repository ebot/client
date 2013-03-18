var deviceMeta = require('./meta-props');

module.exports = deviceHandlers;

function deviceHandlers(platform) {

	platform.prototype.dataEvent = function dataEvent(type, dat) {

		var mod = this;
		var trigger = {

			'ACK' : function(dat) {

				mod.ackHandler(dat || null);
			}
			, 'DEVICE' : function(dat) {

				mod.deviceHandler(dat);
			}
			, 'PLUGIN' : function(dat) {

				mod.pluginHandler(dat);
			}
			, 'UNPLUG' : function(dat) {

				mod.log.debug("Device unplug: %s", dat);
			}
			, 'ERROR' : function(dat) {

				mod.log.debug("Device error: %s", dat);
			}
		}

		if(!trigger[type]) {

			this.log.debug("Unrecognized data event %s", type);
			return;
		}

		trigger[type](dat);
	};

	platform.prototype.deviceHandler = function(dataset) {

		/**
		 * device specific data handlers
		 */
		var mod = this;

		if(!(dataset instanceof Array)) { return; }
		dataset.map(function(device) {

			if(deviceMeta[device.V][device.D]) {

				var meta = deviceMeta[device.V][device.D];
				if(mod[meta.method]) {

					// a little too verbose
					// mod.log.debug(

					// 	"platform: Device write \"%s\" (%s)"
					// 	, device.DA
					// 	, device.D
					// );
					return mod[meta.method](device, meta);
				}
				else {

					/**
					 * Device with meta data but no methods
					 */
					if(meta.debounceCommands && meta.debounceTimeout && !device.DEBOUNCED) {

						mod.log.debug(

							"platform: Device debounceable data \"%s\" (%s)"
							, device.DA
							, device.D
						);
						return mod.debounceCommand(device, meta.debounceTimeout);
					}
				}
			}
			mod.log.debug(

				"platform: Device data \"%s\" (%s)"
				, device.DA
				, device.D
			);
			mod.sendData(device);
		});	
	};

	platform.prototype.pluginHandler = function(dataset) {
		
		var mod = this;
		if(!(dataset instanceof Array)) { return; }
		dataset.map(function(device) {

			mod.log.debug("platform: Device plugged in (%s)", device.GUID);
			mod.sendConfig("PLUGIN", device);
		});
	};

	platform.prototype.ackHandler = function(dataset) {

		var mod = this;
		if(!(dataset) || !dataset instanceof Array) { return; }

		dataset.map(function(ack) {
			
			var meta = deviceMeta[ack.V][ack.D] || undefined;
			if(meta && meta.ackMethod && mod[meta.ackMethod]) {

				mod[meta.ackMethod](ack.DA || "unknown");
			}
			mod.emit("ack", ack);
		});
	};

	// device has been opened
	// TODO: move device stuff into device module
	platform.prototype.onOpen = function onOpen() {
		
		this.log.info(

			"platform: Device connection established (%s)"
			, this.opts.devicePath || this.opts.deviceHost
		)
		this.emit('open'); // emit for platform once listener
	};

	platform.prototype.onClose = function onClose() {

		if(this.device.errorEmitted) { return; }
		this.log.info(

			"platform: Device connection lost (%s)"
			, this.opts.devicePath || this.opts.deviceHost
		)
		setTimeout(this.createStream.bind(this), 2000);
	};

	platform.prototype.onError = function onError(err) {

		this.log.error(

			"platform: %s (%s)"
			, err
			, this.opts.devicePath || this.opts.deviceHost
		);
		setTimeout(this.createStream.bind(this), 2000);
	};

	platform.prototype.onData = function onData(dat) {
		
		var mod = this;
		dat = this.getJSON(dat) || [ ];

		if(!dat) { return; }
		Object.keys(dat).forEach(function(key) {

			mod.dataEvent(key, dat[key]);
		});
	};

	platform.prototype.onCommand = function onCommand(dat) {

		var mod = this;
		if(!dat) { return; }

		mod.log.debug("platform: Command sent to %s", dat.GUID);
		if(deviceMeta[dat.V][dat.D]) {

			var meta = deviceMeta[dat.V][dat.D];
			if(meta.debounce === true && meta.debounceTimeout) {

				return mod.debounceCommand(dat);
			}
			if(meta.queueCommands === true) {

				return mod.queueCommand(dat);
			}
		}
		// write directly to device
	};
};
