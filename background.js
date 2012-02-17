/*
	background.js
	Copyright © 2009 - 2012  WOT Services Oy <info@mywot.com>

	This file is part of WOT.

	WOT is free software: you can redistribute it and/or modify it
	under the terms of the GNU General Public License as published by
	the Free Software Foundation, either version 3 of the License, or
	(at your option) any later version.

	WOT is distributed in the hope that it will be useful, but WITHOUT
	ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
	or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
	License for more details.

	You should have received a copy of the GNU General Public License
	along with WOT. If not, see <http://www.gnu.org/licenses/>.
*/

$.extend(wot, { core: {
	usermessage: {},
	usercontent: [],
	lastshown: {},

	loadratings: function(hosts, onupdate)
	{
		if (typeof(hosts) == "string") {
			var target = wot.url.gethostname(hosts);

			if (target) {
				return wot.api.query(target, onupdate);
			}
		} else if (typeof(hosts) == "object" && hosts.length > 0) {
			return wot.api.link(hosts, onupdate);
		}

		(onupdate || function() {})([]);
		return false;
	},

	update: function()
	{
		try {
			wot.core.updatetab(safari.application.activeBrowserWindow.activeTab);
		} catch (e) {
			console.log("core.update: failed with " + e + "\n");
		}
	},

	updatetab: function(tab)
	{
		wot.log("core.updatetab: " + tab.url + "\n");

		if (wot.api.isregistered()) {
			wot.core.loadratings(tab.url, function(hosts) {
				wot.core.updatetabstate(tab, {
					target: hosts[0],
					decodedtarget: wot.url.decodehostname(hosts[0]),
					cached: wot.cache.get(hosts[0]) || { value: {} }
				});
			});
		} else {
			wot.core.updatetabstate(tab, { status: "notready", cached: {} });
		}
	},

	geticon: function(data)
	{
		try {
			if (data.status == "notready") {
				return "loading";
			}

			var cached = data.cached || {};
		
			if (cached.status == wot.cachestatus.ok) {
				/* reputation */
				var def_comp = cached.value[wot.default_component];

				var result = wot.getlevel(wot.reputationlevels,
								(def_comp && def_comp.r != null) ?
									def_comp.r : -1).name;

				/* additional classes */
				if (result != "rx") {
					if (this.unseenmessage()) {
						result = "message_" + result;
					} else if (result != "r0" &&
								!wot.components.some(function(item) {
									return (cached.value[item.name] &&
											cached.value[item.name].t >= 0);
								})) {
						result = "new_" + result;
					}
				}

				return result;
			} else if (cached.status == wot.cachestatus.busy) {
				return "loading";
			} else if (cached.status == wot.cachestatus.error) {
				return "error";
			}
			
			return "default";
		} catch (e) {
			console.log("core.geticon: failed with " + e);
		}

		return "error";
	},

	getmaskicon: function(name)
	{
		if (wot.prefs.get("accessible")) {
			return name;
		}

		var maskmap = {
			"default": "mask/r0",
			"error": "mask/error",
			"loading": "mask/r0",
			"r0": "mask/r0",
			"r1": "mask/r1-3",
			"r2": "mask/r1-3",
			"r3": "mask/r1-3",
			"r4": "mask/r4-5",
			"r5": "mask/r4-5",
			"rx": "mask/rx"
		};

		return maskmap[name.replace(/^(new|message)_/, "")];
	},

	seticon: function(tab, data)
	{
		try {
			wot.log("core.seticon: " + tab.url + "\n");

			for (var i = 0; i < safari.extension.toolbarItems.length; ++i) {
				var button = safari.extension.toolbarItems[i];

				if (button.browserWindow == tab.browserWindow) {
					var image = wot.geticon(this.getmaskicon(this.geticon(data)),
										16, wot.prefs.get("accessible"))
					button.image = safari.extension.baseURI + image;
				}
			}
		} catch (e) {
			console.log("core.seticon: failed with " + e + "\n");
		}
	},

	updatetabstate: function(tab, data)
	{
		try {
			if (tab == tab.browserWindow.activeTab) {
				/* update the toolbar item */
				this.seticon(tab, data);
			}

			/* update content scripts */
			this.updatetabwarning(tab, data);

			wot.post("status", "update", {
					data: data,
					usercontent: {
						message: wot.core.usermessage,
						content: wot.core.usercontent
					}
				}, tab);
		} catch (e) {
			console.log("core.updatetabstate: failed with " + e + "\n");
		}
	},

	updatetabwarning: function(tab, data)
	{
		try {
			if (data.cached.status != wot.cachestatus.ok ||
					data.cached.flags.warned) {
				return; /* don't change the current status */
			}
			
			var prefs = [
				"accessible",
				"min_confidence_level",
				"warning_opacity"
			];

			wot.components.forEach(function(item) {
				prefs.push("show_application_" + item.name);
				prefs.push("warning_level_" + item.name);
				prefs.push("warning_type_" + item.name);
				prefs.push("warning_unknown_" + item.name);
			});

			var settings = {};

			prefs.forEach(function(item) {
				settings[item] = wot.prefs.get(item);
			});

			var type = wot.getwarningtype(data.cached.value, settings);

			if (type && type.type == wot.warningtypes.overlay) {
				wot.post("warning", "show", {
						data: data,
						type: type,
						settings: settings
					}, tab);
			}
		} catch (e) {
			wot.log("core.updatetabwarning: failed with " + e + "\n");
		}
	},


	setusermessage: function(data)
	{
		try {
			this.usermessage = {};

			var elems = data.getElementsByTagName("message");

			for (var i = 0; elems && i < elems.length; ++i) {
				var elem = $(elems[i]);

				var obj = {
					text: elem.text()
				};

				[ "id", "type", "url", "target", "version", "than" ]
					.forEach(function(name) {
						obj[name] = elem.attr(name);
					});

				if (obj.id && obj.type &&
						(obj.target == "all" || obj.target == wot.platform) &&
						(!obj.version || !obj.than ||
						 	(obj.version == "eq" && wot.version == obj.than) ||
							(obj.version == "le" && wot.version <= obj.than) ||
							(obj.version == "ge" && wot.version >= obj.than))) {
					this.usermessage = obj;
					break;
				}
			}
		} catch (e) {
			console.log("core.setusermessage: failed with " + e + "\n");
		}
	},

	unseenmessage: function()
	{
		return (this.usermessage.text &&
					this.usermessage.id &&
					this.usermessage.id != wot.prefs.get("last_message") &&
					this.usermessage.id != "downtime");
	},

	setusercontent: function(data)
	{
		try {
			this.usercontent = [];

			var elems = data.getElementsByTagName("user");

			for (var i = 0; elems && i < elems.length &&
					this.usercontent.length < 4; ++i) {
				var elem = $(elems[i]);
				var obj = {};

				[ "icon", "bar", "length", "label", "url", "text", "notice" ]
					.forEach(function(name) {
						obj[name] = elem.attr(name);
					});

				if (obj.text && (!obj.bar ||
						(obj.length != null && obj.label))) {
					this.usercontent.push(obj);
				}
			}
		} catch (e) {
			console.log("core.setusercontent: failed with " + e + "\n");
		}
	},

	setuserlevel: function(data)
	{
		try {
			var elems = data.getElementsByTagName("status");

			if (elems && elems.length > 0) {
				wot.prefs.set("status_level", $(elems[0]).attr("level") || "");
			} else {
				wot.prefs.clear("status_level");
			}
		} catch (e) {
			console.log("core.setuserlevel: failed with " + e + "\n");
		}
	},

	processrules: function(url, onmatch)
	{
		onmatch = onmatch || function() {};

		if (!wot.api.state || !wot.api.state.search) {
			return false;
		}

		var state = wot.prefs.get("search:state") || {};

		for (var i = 0; i < wot.api.state.search.length; ++i) {
			var rule = wot.api.state.search[i];

			if (state[rule.name]) {
				continue; /* disabled */
			}

			if (wot.matchruleurl(rule, url)) {
				onmatch(rule);
				return true;
			}
		}

		return false;
	},

	onload: function()
	{
		try {
			/* messages */

			wot.bind("prefs:set", function(name, value) {
				wot.popover.contentWindow.wot.ratingwindow.update_settings();
			});

			wot.bind("message:search:hello", function(port, data) {
				wot.core.processrules(data.url, function(rule) {
					port.post("process", { url: data.url, rule: rule });
				});
			});

			wot.bind("message:search:get", function(port, data) {
				wot.core.loadratings(data.targets, function(hosts) {
					var ratings = {};

					hosts.forEach(function(target) {
						var obj = wot.cache.get(target) || {};

						if (obj.status == wot.cachestatus.ok ||
							obj.status == wot.cachestatus.link) {
							ratings[target] = obj.value;
						}
					});

					port.post("update", { rule: data.rule, ratings: ratings });
				});
			});

			wot.bind("message:search:openscorecard", function(port, data) {
				var wnd = safari.application.activeBrowserWindow;
				var tab = wnd.openTab("foreground");
				tab.url = wot.urls.scorecard + encodeURIComponent(data.target);
			});

			wot.bind("message:my:update", function(port, data) {
				port.post("setcookies", {
					cookies: wot.api.processcookies(data.cookies) || []
				});
			});

			wot.bind("message:update:status", function(port, data) {
				wot.core.update();
			});

			wot.bind("message:rating:finishstate", function(port, data) {
				/* message was shown */
				if (wot.core.unseenmessage()) {
					wot.prefs.set("last_message", wot.core.usermessage.id);
				}

				/* check for rating changes */
				if (wot.cache.cacheratingstate(data.state.target,
							data.state)) {
					/* submit new ratings */
					var params = {};

					wot.components.forEach(function(item) {
						if (data.state[item.name]) {
							params["testimony_" + item.name] =
								data.state[item.name].t;
						}
					});

					wot.api.submit(data.state.target, params);
				}

				/* update all views */
				wot.core.update();
			});

			wot.bind("message:rating:navigate", function(port, data) {
				var wnd = safari.application.activeBrowserWindow;
				var tab = wnd.openTab("foreground");
				tab.url = data.url;
			});

			wot.bind("message:rating:openscorecard", function(port, data) {
				var wnd = safari.application.activeBrowserWindow;
				var tab = wnd.activeTab;
				var host = wot.url.gethostname(tab.url);
				tab = wnd.openTab("foreground");
				tab.url = wot.urls.scorecard + encodeURIComponent(host);
			});

			wot.bind("message:rating:update", function(port, data) {
				var tab = safari.application.activeBrowserWindow.activeTab;
				var host = wot.url.gethostname(tab.url);

				var time = Date.now();

				/* clean up old entries from our list of recently shown
					ratings */
				for (var i in wot.core.lastshown) {
					if ((time - wot.core.lastshown[i]) > wot.cache.maxage) {
						delete(wot.core.lastshown[i]);
					}	
				}

				/* shown the rating on the page if it hasn't been shown in
					a while */
				if (host && !wot.core.lastshown[host]) {
					wot.core.lastshown[host] = time;

					if (wot.prefs.get("show_rating_frame")) {
						port.post("toggle");
					}
				}
			});

//			wot.bind("message:rating:togglewindow", function(port, data) {
//				port.post("togglewindow");
//			});

			wot.listen([ "search", "my", "update", "rating" ]);

			/* event handlers */
			safari.application.addEventListener("command", function(e) {
				if (e.command == "showRatingWindow") {
					console.log('Popover command', e);
					e.target.showPopover();
				}
				});

			safari.application.addEventListener("popover", function(e) {
					console.log('Popover event');
				}, false);

			safari.application.addEventListener("validate", function(e) {
					if (e.target.identifier === "wot_button") {
						wot.core.update();
					}
				}, false);


			// Instantiate Popover and
			var popup = safari.extension.createPopover("wot_ratewindow", safari.extension.baseURI+"content/ratingwindow.html", 335, 420);

			for(i=0; i < safari.extension.toolbarItems.length; i++) {

				var tbi = safari.extension.toolbarItems[i];
				if(tbi.identifier == 'wot_button') {
					tbi.popover = popup;
					break;
				}
			}

			if (wot.debug) {
				wot.prefs.clear("update:state");

				wot.bind("cache:set", function(name, value) {
					console.log("cache.set: " + name + " = " +
						JSON.stringify(value) + "\n");
				});

				wot.bind("prefs:set", function(name, value) {
					console.log("prefs.set: " + name + " = " +
						JSON.stringify(value) + "\n");
				});
			}

			/* initialize */

			wot.api.register(function() {

				// this call is disabled, cause it fails api.query with proper lang for some reason.
				//wot.core.update();

				if (wot.api.isregistered()) {
					wot.api.setcookies();
					wot.api.update();
					wot.api.processpending();
				}
			});

			wot.cache.purge();
		} catch (e) {
			console.log("core.onload: failed with " + e + "\n");
		}
	}
}});

wot.core.onload();
