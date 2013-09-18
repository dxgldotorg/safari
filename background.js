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
    activity_score: 0,
    badge_status: null,
    first_run: false,       // sesion variable, to know if this launch is the first after installation
    launch_time: null,      // time when current session was started
	lastshown: {},
    badge: {
        type: null,
        text: ""
    },
    popover: {
        height: 416,
        width: 580
    },

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

	update: function(update_rw)
	{
		try {
			wot.core.updatetab(safari.application.activeBrowserWindow.activeTab, update_rw);
		} catch (e) {
			console.error("core.update: failed with " + e);
		}
	},

	updatetab: function(tab, update_rw)
	{
		wot.log("core.updatetab: " + tab.url);

		if (wot.api.isregistered()) {
			wot.core.loadratings(tab.url, function(hosts) {
				wot.core.updatetabstate(tab, {
					target: hosts[0],
					decodedtarget: wot.url.decodehostname(hosts[0]),
					cached: wot.cache.get(hosts[0]) || { value: {} }
				}, update_rw);
			});
		} else {
			wot.core.updatetabstate(tab, { status: "notready", cached: {} }, update_rw);
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
					} else if (result != "r0" && !wot.is_rated(cached.value)) {
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
			console.error("core.geticon: failed with " + e);
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
			wot.log("core.seticon: " + tab.url);

			for (var i = 0; i < safari.extension.toolbarItems.length; ++i) {
				var button = safari.extension.toolbarItems[i];

				if (button.browserWindow == tab.browserWindow) {
					var image = wot.geticon(this.getmaskicon(this.geticon(data)),
										16, wot.prefs.get("accessible"));
					button.image = safari.extension.baseURI + image;
				}
			}
		} catch (e) {
			wot.flog("core.seticon: failed with " + e);
		}
	},

    update_ratingwindow_comment: function () {
        if(wot.popover && wot.popover.contentWindow && wot.popover.contentWindow.wot) {
            try {
                var rw = wot.popover.contentWindow.wot.ratingwindow,
                    tab = safari.application.activeBrowserWindow.activeTab;
                var target = wot.url.gethostname(tab.url),
                    cached = wot.cache.get(target);

                // get locally stored comment if exists
                var local_comment = wot.keeper.get_comment(target);
                rw.update_comment(cached, local_comment, wot.cache.captcha_required);
            } catch (e) {
                console.error("core.update_ratingwindow_comment() failed with " + e);
            }
        }
    },

	updatetabstate: function(tab, data, update_rw)
	{
		try {
			if (tab == tab.browserWindow.activeTab) {
				/* update the toolbar item */
				this.seticon(tab, data);
			}

			/* update content scripts */
			this.updatetabwarning(tab, data);

			var usercontent =  {
				message: wot.core.usermessage,
					content: wot.core.usercontent
			};

			wot.post("status", "update", {
					data: data,
					usercontent: usercontent
				}, tab);

			// also, call ratingwindow.update()
			if(update_rw && wot.popover && wot.popover.contentWindow
				&& wot.popover.contentWindow.wot) {
				var ratingwindow = wot.popover.contentWindow.wot.ratingwindow;

				if(ratingwindow) {
					ratingwindow.usercontent = usercontent;
					ratingwindow.update(data);
				}
			}

		} catch (e) {
			wot.flog("core.updatetabstate: failed with " + e);
		}
	},

	updatetabwarning: function(tab, data)
	{
		var cached = data.cached, warned = null;
		try {
			/* Check if "warned" flag is expired */
			if(cached.flags && cached.flags.warned) {
				warned = cached.flags.warned;

				var ctime = (new Date()).getTime();
				if(cached.flags.warned_expire && (ctime > cached.flags.warned_expire)) {
					warned = false;
				}
			}

			if (cached.status != wot.cachestatus.ok || warned) {
				return; /* don't change the current status */
			}
			
			var prefs = [
				"accessible",
				"min_confidence_level",
				"warning_opacity",
                "update:state"
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

			var type = wot.getwarningtype(cached.value, settings);

			if (type && type.type == wot.warningtypes.overlay) {
				wot.post("warning", "show", {
						data: data,
						type: type,
						settings: settings
					}, tab);
			}
		} catch (e) {
			wot.flog("core.updatetabwarning: failed with " + e);
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
			wot.flog("core.setusermessage: failed with " + e);
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
			wot.flog("core.setusercontent: failed with " + e);
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
			wot.flog("core.setuserlevel: failed with " + e);
		}
	},

    is_level: function (level) {
        try {
            var w_key = wot.prefs.get("witness_key"),
                user_level = wot.prefs.get("status_level");

            if (!user_level && level == null) return true;
            var h = wot.crypto.bintohex(wot.crypto.sha1.hmacsha1hex(w_key, "level="+level)); // encrypt the string by user's key
            return (user_level == h);

        } catch (e) {
            console.error("wot.core.is_level failed", e);
            return false;   // in case of errors it is safer to assume that user is not registered yet
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

	attach_popover: function()
	{
		// walk through all windows/toolbars and attach popover
		for(i=0; i < safari.extension.toolbarItems.length; i++) {

			var tbi = safari.extension.toolbarItems[i];
			if(tbi.identifier == 'wot_button' && !tbi.popover) {
				tbi.popover = wot.popover;
			}
		}
	},

	finishstate: function(unload, data)
	{
//        console.log("core.finishstate()", arguments);
        var _this = wot.core;

        if (!data || !data.target) return;  // do nothing if target is undefined

        try {
            var target = data.target,
                is_rated = false,
                testimonies_changed = false,
                comment_changed = false,
                has_comment = false,
                user_comment = data.user_comment,
                user_comment_id = 0,
                cached = data.cached,
                changed_votes = data.changed_votes,     // user votes diff as an object
                changed_votes_str = data.changed_votes_str, // user's votes diff for categories as string
                votes = data.votes, // user's votes for categories as object {cat_id : vote }
                has_up_votes = data.has_up_votes,
                votes_changed = false;  // just a flag that votes have been changed

            /* message was shown */

            // on unload finishing, restore previous message or remove current
            if (unload && _this.usermessage && _this.usermessage.previous) {
                _this.usermessage = _this.usermessage.previous;
            }

            if (_this.unseenmessage()) {
                wot.prefs.set("last_message", _this.usermessage.id);
            }

            if (target) {
                is_rated = data.is_rated;
                votes_changed = !wot.utils.isEmptyObject(changed_votes);

                // Whether ratings OR categories were changed?
                testimonies_changed = (data.was_in_ratemode && (wot.cache.cacheratingstate(target, data.state, changed_votes) || votes_changed));

                has_comment = (user_comment.length > 0);

                if (cached.comment && cached.comment.comment && cached.comment.comment.length > 0) {
                    user_comment_id = cached.comment.wcid;
                    comment_changed = (cached.comment.comment != user_comment);
                } else {
                    comment_changed = has_comment;  // since there was no comment before
                    user_comment_id = 0;            // no previous comment, set cid to zero
                }
            }

//            console.log("testimonies_changed:", testimonies_changed);
//            console.log("comment_changed:", comment_changed);
//            console.log("is_rated:", is_rated);
//            console.log("has_comment:", has_comment);

            /* if user's testimonies or categories were changed, store them in the cache and submit */
            if (testimonies_changed) {

                // don't show warning screen immediately after rating and set "expire to" flag
                var warned_expire = (new Date()).getTime() + wot.expire_warned_after;
                wot.cache.setflags(target, {warned: true, warned_expire: warned_expire });

                /* submit new ratings */
                var params = {};

                wot.components.forEach(function(item) {
                    if (data.state[item.name]) {
                        params["testimony_" + item.name] = data.state[item.name].t;
                    }
                });

                if (votes_changed) {
                    params.votes = changed_votes_str;
                }

                wot.api.submit(target, params);

                var submission_mode = unload ? "auto" : "manual";

                // count testimony event
                if (is_rated) {
                    wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY, submission_mode);
                } else {
                    wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_TESTIMONY_DEL, submission_mode);
                }

            } else {
//                console.log("No testimonies & votes to submit them. Ignored.");
            }

            if (unload) {  // RW was closed by browser (not by clicking "Save")
//                console.log("RW triggered finish state during Unload");

                if ((comment_changed)) {
//                    console.log("The comment seems to be changed");
                    // when comment body is changed, we might want to store it locally
                    wot.keeper.save_comment(target, user_comment, user_comment_id, votes, wot.keeper.STATUSES.LOCAL);
                    wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTKEPT);
                }

            } else { // User clicked Save
                // TODO: make it so, that if votes were changed and user have seen the comment, then submit the comment
                if (comment_changed && has_up_votes) {
                    // Comment should be submitted, if (either comment OR categories votes were changed) AND at least one up vote is given
                    if (has_comment) {
//                        console.log("SUBMIT COMMENT");

                        // If user can't leave a comment for a reason, accept the comment locally, otherwise submit it silently
                        var keeper_status = (data.allow_commenting && data.is_registered) ? wot.keeper.STATUSES.SUBMITTING : wot.keeper.STATUSES.LOCAL;
                        wot.keeper.save_comment(target, user_comment, user_comment_id, votes, keeper_status);

                        if (data.allow_commenting && data.is_registered) {
                            wot.api.comments.submit(target, user_comment, user_comment_id, data.votes_str);
                            wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTADDED);
                        }

                    } else {
                        if (comment_changed) {
                            // remove the comment
//                            console.log("REMOVE COMMENT");
                            wot.keeper.remove_comment(target);
                            if (data.is_registered) {
                                wot.api.comments.remove(target);
                                wot.ga.fire_event(wot.ga.categories.RW, wot.ga.actions.RW_COMMENTREMOVED);
                            }
                        }
                    }
                }
            }

            /* update all views */
            wot.core.update(false);   // explicitly told to not update the rating window
        } catch (e) {
            console.error("ratingwindow.finishstate: failed with ", e);
        }
	},

	onload: function()
	{
		try {
			/* messages */

			wot.use_popover = !!safari.extension.createPopover; // detect whether the browser supports popovers

			if(wot.use_popover) {
				wot.bind("prefs:set", function(name, value) {
					var updsettings_func = wot.popover.contentWindow.wot.ratingwindow.update_settings;
					try {
						updsettings_func();
					} catch (e) {
						// it is possible to get exception when window is not inited
						setTimeout(updsettings_func, 500);
					}
				});
			}

			wot.bind("message:search:hello", function(port, data) {
				wot.core.processrules(data.url, function(rule) {
					port.post("process", { url: data.url, rule: rule });
				});
			});

			wot.bind("message:tab:close", function(port, data) {
				if(port.tab) {
					port.tab.close();
				}
			});

			wot.bind("message:search:get", function(port, data) {
				wot.core.loadratings(data.targets, function(hosts) {
					var ratings = {};

					hosts.forEach(function(target) {
						var obj = wot.cache.get(target) || {};

						if (obj.status == wot.cachestatus.ok ||
							obj.status == wot.cachestatus.link) {
                            obj.value.decodedtarget = wot.url.decodehostname(obj.value.target);
							ratings[target] = obj.value;
						}
					});

					port.post("update", { rule: data.rule, ratings: ratings });
				});
			});

			wot.bind("message:search:openscorecard", function(port, data) {
				var wnd = safari.application.activeBrowserWindow;
				var tab = wnd.openTab("foreground");
				tab.url = wot.contextedurl(wot.urls.scorecard +
					encodeURIComponent(data.target),data.ctx);
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
//                console.log("message:rating:finishstate");
				wot.core.finishstate(data);
			});

			wot.bind("message:rating:navigate", function(port, data) {
				var wnd = safari.application.activeBrowserWindow;
				var tab = wnd.openTab("foreground");
				tab.url = wot.contextedurl(data.url, data.context);
			});

			wot.bind("message:rating:openscorecard", function(port, data) {
				var wnd = safari.application.activeBrowserWindow;
				var tab = wnd.activeTab;
				var host = wot.url.gethostname(tab.url);
				tab = wnd.openTab("foreground");
				tab.url = wot.contextedurl(wot.contewot.urls.scorecard +
					encodeURIComponent(host), data.context);
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

			if(wot.use_popover) {
				/* event handlers */
				safari.application.addEventListener("command", function(e) {
					if (e.command == "showRatingWindow") {
						e.target.showPopover();
					}
					});

				// Instantiate Popover and attach it to all windows-wot-toolbars
				safari.extension.popovers.forEach(function(item) {
					if(item.identifier == "wot_ratewindow") {
						wot.popover = item;
					}
				});

				if(!wot.popover) {
					wot.popover = safari.extension.createPopover("wot_ratewindow",
						safari.extension.baseURI+"content/ratingwindow.html", wot.core.popover.width, wot.core.popover.height);
				}

				this.attach_popover();


				// Attach popover to a newly created window (toolbar)
				safari.application.addEventListener("open", function(e) {
					// react only if target = SafariBrowserWindow (contains tabs array)
					if(e.target instanceof window.SafariBrowserWindow) {
						wot.core.attach_popover();
					}
				}, true);

				safari.application.addEventListener("validate", function(e) {
                    // when tab is switched, for example
					if (e.target.identifier === "wot_button") {
						wot.core.update(true);
					}
				}, false);
			} else {
				// This part is used for old Safari (<5.1) which don't
				// support Popovers feature

				wot.bind("message:rating:togglewindow", function(port, data) {
					port.post("togglewindow");
				});

				/* event handlers */

				safari.application.addEventListener("command", function(e) {
					if (e.command == "showRatingWindow") {
						wot.post("rating", "togglewindow");
					}
				}, false);

				safari.application.addEventListener("validate", function(e) {
					if (e.command == "showRatingWindow") {
						wot.core.update();
					}
				}, false);
			}

			wot.listen([ "search", "my", "update", "rating", "tab" ]);

			if (wot.debug) {
				wot.prefs.clear("update:state");

				wot.bind("cache:set", function(name, value) {
					wot.flog("cache.set: " + name + " = " +
						JSON.stringify(value));
				});

				wot.bind("prefs:set", function(name, value) {
					wot.flog("prefs.set: " + name + " = " +
						JSON.stringify(value));
				});
			}

			/* initialize */
			wot.api.register(function() {

				if(!wot.use_popover) {
					wot.core.update();
				}

				if (wot.api.isregistered()) {
//                    wot.core.welcome_user();
					wot.api.setcookies();
					wot.api.update();
					wot.api.processpending();
                    wot.api.comments.processpending();
                    wot.wt.init();  // initialize welcome tips engine
//                    wot.surveys.init(); // init surveys engine
                }
			});

			wot.cache.purge();


		} catch (e) {
			wot.flog("core.onload: failed with " + e);
		}
	}
}});

wot.core.onload();
