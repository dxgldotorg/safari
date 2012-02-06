wot.rating = {
	toggleframe: function(id, file, style)
	{
		try {
			var frame = document.getElementById(id);

			if (frame) {
				frame.parentNode.removeChild(frame);
				return true;
			} else {
				var body = document.getElementsByTagName("body");

				if (body && body.length) {
					frame = document.createElement("iframe");

					if (frame) {
						frame.src = safari.extension.baseURI + file;

						frame.setAttribute("id", id);
						frame.setAttribute("style", style);

						if (body[0].appendChild(frame)) {
							return true;
						}
					}
				}
			}
		} catch (e) {
			console.log("rating.toogleframe: failed with " + e + "\n");
		}

		return false;
	},

	hideframe: function(id)
	{
		try {
			var frame = document.getElementById(id);

			if (frame) {
				frame.parentNode.removeChild(frame);
			}
		} catch (e) {
			console.log("rating.hideframe: failed with " + e + "\n");
		}
	},

	toggle: function()
	{
		this.toggleframe("wot-rating-frame",
			"content/ratingframe.html",
			"border: 0 ! important; " +
			"height: 80px ! important; " +
			"left: 0px ! important; " +
			"opacity: 0.9 ! important; " +
			"position: fixed ! important; " +
			"top: 0px ! important; " +
			"width: 80px ! important; " +
			"z-index: 2147483647 ! important;");

		window.setTimeout(function() {
				wot.rating.hideframe("wot-rating-frame");
			}, 3000);
	},

//	togglewindow: function()
//	{
//		var rv = this.toggleframe("wot-rating-window-frame",
//					"content/ratingwindow.html",
//					"border: 0 ! important; " +
//					"height: 100% ! important; " +
//					"left: 0px ! important; " +
//					"position: fixed ! important; " +
//					"top: 0px ! important; " +
//					"width: 100% ! important; " +
//					"z-index: 2147483647 ! important;");
//
//		if (!rv) {
//			wot.post("rating", "openscorecard");
//		}
//	},

	onload: function()
	{
		if (window != top) {
			return;
		}

//		wot.bind("message:rating:togglewindow", function(port, data) {
//			wot.rating.togglewindow();
//		});

		wot.bind("message:rating:toggle", function(port, data) {
			wot.rating.toggle();
		});
		
		wot.listen("rating");

		document.addEventListener("DOMContentLoaded", function() {
			wot.post("rating", "update");
		});

		if (/loaded|complete/.test(document.readyState)) {
			wot.post("rating", "update");
		}
	}
};

wot.rating.onload();
