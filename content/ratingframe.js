/*
	ratingframe.js
	Copyright © 2010 - 2012  WOT Services Oy <info@mywot.com>

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

$.extend(wot, { ratingframe: {
	update: function(data, accessible) {
		try {
			var values = (data.cached && data.cached.value) ?
												data.cached.value : {};
			$("#wot-reputation")
				.attr("reputation",
				(data.cached.status == wot.cachestatus.ok) ?
						wot.getlevel(wot.reputationlevels,
							values[0] ?
							values[0].r : -1).name : "")
				.toggleClass("accessible", accessible)
				.toggleClass("unrated", !wot.is_rated(values));

		} catch (e) {
			wot.flog("ratingframe.update: failed with " + e);
		}
	},

	onload: function()
	{
		wot.bind("message:status:update", function(port, data) {
			wot.prefs.get("accessible", function(name, value) {
				wot.ratingframe.update(data.data, value);
			});
		});

		wot.listen("status");

		wot.post("update", "status");

		$("#wot-reputation-bg").bind("click", function() {
			wot.post("rating", "togglewindow");
		});
	}
}});

$(document).ready(function() {
	wot.ratingframe.onload();
});
