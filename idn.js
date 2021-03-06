/*
	idn.js
	Copyright © 2009  WOT Services Oy <info@mywot.com>

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

$.extend(wot, { idn: {
	ace: "xn--",

	toascii: function(target)
	{
		try {
			if (/[\[\:]/.test(target)) {
				return target; /* doesn't look like a proper name */
			}

			var result = [];

			target.toLowerCase().split(".").forEach(function(part) {
				if (/^[\w\-]*$/.test(part)) {
					result.push(part);
				} else {
					result.push(wot.idn.ace + wot.idn.punycode.encode(part));
				}
			});

			return result.join(".");
		} catch (e) {
			console.log("idn.toascii: failed with " + e + "\n");
		}

		return target;
	},

	tounicode: function(target)
	{
		try {
			if (!target) {
				return target;
			}

			var result = [];

			target.toLowerCase().split(".").forEach(function(part) {
				if (part.indexOf(wot.idn.ace) == 0) {
					result.push(wot.idn.punycode.decode(
						part.replace(wot.idn.ace, "")));
				} else {
					result.push(part);
				}
			});

			return result.join(".");
		} catch (e) {
			console.log("idn.tounicode: failed with " + e + "\n");
		}

		return target;
	},

	/* Javascript UTF16 converter created by some@domain.name. This
		implementation is released to public domain */

	utf16: {
		decode: function(input)
		{
			var output = [], i = 0, len = input.length, value, extra;

			while (i < len) {
				value = input.charCodeAt(i++);

				if ((value & 0xF800) === 0xD800) {
					extra = input.charCodeAt(i++);

					if (((value & 0xFC00) !== 0xD800) ||
						((extra & 0xFC00) !== 0xDC00)) {
						throw new RangeError("utf16.decode: illegal sequence");
					}

					value = ((value & 0x3FF) << 10) + (extra & 0x3FF) + 0x10000;
				}

				output.push(value);
			}

			return output;
		},

		encode: function(input)
		{
			var output = [], i = 0, len = input.length, value;

			while (i < len) {
				value = input[i++];

				if ((value & 0xF800) === 0xD800) {
					throw new RangeError("utf16.encode: illegal value");
				}

				if (value > 0xFFFF) {
					value -= 0x10000;
					output.push(String.fromCharCode(((value >>>10) & 0x3FF) |
							0xD800));
					value = 0xDC00 | (value & 0x3FF);
				}

				output.push(String.fromCharCode(value));
			}

			return output.join("");
		}
	},

	/* Javascript Punycode converter derived from example in RFC3492. This
		implementation is created by some@domain.name and released to public
		domain */

	punycode: {
		initial_n: 0x80,
		initial_bias: 72,
		delimiter: "\x2D",
		base: 36,
		damp: 700,
		tmin: 1,
		tmax: 26,
		skew: 38,
		maxint: 0x7FFFFFFF,

		/* decode_digit(cp) returns the numeric value of a basic code point
			(for use in representing integers) in the range 0 to base-1, or
			base if cp is does not represent a value. */

		decode_digit: function(cp)
		{
			return cp - 48 < 10 ?
					cp - 22 : cp - 65 < 26 ?
						cp - 65 : cp - 97 < 26 ?
							cp - 97 : base;
		},

		/* encode_digit(d,flag) returns the basic code point whose value
			(when used for representing integers) is d, which needs to be in
			the range 0 to base-1.  The lowercase form is used unless flag is
			nonzero, in which case the uppercase form is used.  The behavior
			is undefined if flag is nonzero and digit d has no uppercase
			form. */

		encode_digit: function(d, flag)
		{
			/* 0..25 map to ASCII a..z or A..Z
			  26..35 map to ASCII 0..9 */
			return d + 22 + 75 * (d < 26) - ((flag != 0) << 5);
		},

		/* Bias adaptation function */

		adapt: function(delta, numpoints, firsttime)
		{
			var k;

			delta = firsttime ? Math.floor(delta / this.damp) : (delta >> 1);
			delta += Math.floor(delta / numpoints);

			for (k = 0;  delta > (((this.base - this.tmin) * this.tmax) >> 1);
					k += this.base) {
				delta = Math.floor(delta / (this.base - this.tmin));
			}

			return Math.floor(k + (this.base - this.tmin + 1) * delta /
						(delta + this.skew));
		},

		/* encode_basic(bcp,flag) forces a basic code point to lowercase if
			flag is zero, uppercase if flag is nonzero, and returns the
			resulting code point. The code point is unchanged if it  is
			caseless. The behavior is undefined if bcp is not a basic code
			point. */

		encode_basic: function(bcp, flag)
		{
			bcp -= (bcp - 97 < 26) << 5;
			return bcp + ((!flag && (bcp - 65 < 26)) << 5);
		},

		/* Main decode */

		decode: function(input, preserveCase)
		{
			/* Dont use uft16 */
			var output = [];
			var case_flags = [];
			var input_length = input.length;
			var n, out, i, bias, basic, j, ic, oldi, w, k, digit, t, len;

			/* Initialize the state: */
			n = this.initial_n;
			i = 0;
			bias = this.initial_bias;

			/* Handle the basic code points:  Let basic be the number of input
				code points before the last delimiter, or 0 if there is none,
				then copy the first basic code points to the output. */

			basic = input.lastIndexOf(this.delimiter);

			if (basic < 0) {
				basic = 0;
			}

			for (j = 0; j < basic; ++j) {
				if (preserveCase) {
					case_flags[output.length] = (input.charCodeAt(j) - 65 < 26);
				}
				if (input.charCodeAt(j) >= 0x80) {
					throw new RangeError("decode: illegal input >= 0x80");
				}

				output.push(input.charCodeAt(j));
			}

			/* Main decoding loop:  Start just after the last delimiter if any
				basic code points were copied; start at the beginning
				otherwise. */

			for (ic = basic > 0 ? basic + 1 : 0; ic < input_length; ) {
				/* ic is the index of the next character to be consumed, */

				/* Decode a generalized variable-length integer into delta,
					which gets added to i.  The overflow checking is easier
					if we increase i as we go, then subtract off its starting
					value at the end to obtain delta. */

				for (oldi = i, w = 1, k = this.base; ; k += this.base) {
					if (ic >= input_length) {
						throw RangeError("decode: bad input (1)");
					}

					digit = this.decode_digit(input.charCodeAt(ic++));

					if (digit >= this.base) {
						throw RangeError("decode: bad input (2)");
					}

					if (digit > Math.floor((this.maxint - i) / w)) {
						throw RangeError("decode: overflow (1)");
					}

					i += digit * w;

					t = k <= bias ? this.tmin : k >= bias + this.tmax ?
								this.tmax : k - bias;

					if (digit < t) {
						break;
					}

					if (w > Math.floor(this.maxint / (this.base - t))) {
						throw RangeError("decode: overflow (2)");
					}

					w *= (this.base - t);
				}

				out = output.length + 1;
				bias = this.adapt(i - oldi, out, oldi === 0);

				/* i was supposed to wrap around from out to 0, incrementing n
					each time, so we'll fix that now: */

				if (Math.floor(i / out) > this.maxint - n) {
					throw RangeError("decode: overflow (3)");
				}

				n += Math.floor(i / out);
				i %= out;

				/* Insert n at position i of the output: Case of last character
					determines uppercase flag: */

				if (preserveCase) {
					case_flags.splice(i, 0, input.charCodeAt(ic -1) - 65 < 26);
				}

				output.splice(i, 0, n);
				i++;
			}

			if (preserveCase) {
				for (i = 0, len = output.length; i < len; i++) {
					if (case_flags[i]) {
						output[i] = (String.fromCharCode(output[i])
										.toUpperCase()).charCodeAt(0);
					}
				}
			}

			return wot.idn.utf16.encode(output);
		},

		/* Main encode function */

		encode: function(input, preserveCase)
		{
			/* Bias adaptation function */

			var n, delta, h, b, bias, j, m, q, k, t, ijv, case_flags;

			if (preserveCase) {
				/* Preserve case, step1 of 2: Get a list of the unaltered
					string */
				case_flags = wot.idn.utf16.decode(input);
			}

			/* Converts the input in UTF-16 to Unicode */
			input = wot.idn.utf16.decode(input.toLowerCase());

			var input_length = input.length; /* Cache the length */

			if (preserveCase) {
				/* Preserve case, step2 of 2: Modify the list to true/false */
				for (j = 0; j < input_length; j++) {
					case_flags[j] = input[j] != case_flags[j];
				}
			}

			var output = [];

			/* Initialize the state: */
			n = this.initial_n;
			delta = 0;
			bias = this.initial_bias;

			/* Handle the basic code points: */
			for (j = 0; j < input_length; ++j) {
				if (input[j] < 0x80) {
					output.push(String.fromCharCode(case_flags ?
						this.encode_basic(input[j], case_flags[j]) : input[j]));
				}
			}

			h = b = output.length;

			/* h is the number of code points that have been handled, b is the
				number of basic code points */

			if (b > 0) {
				output.push(this.delimiter);
			}

			/* Main encoding loop: */
			while (h < input_length) {
				/* All non-basic code points < n have been handled already.
					Find the next larger one: */

				for (m = this.maxint, j = 0; j < input_length; ++j) {
					ijv = input[j];

					if (ijv >= n && ijv < m) {
						m = ijv;
					}
				}

				/* Increase delta enough to advance the decoder's <n,i> state
					to <m,0>, but guard against overflow: */

				if (m - n > Math.floor((this.maxint - delta) / (h + 1))) {
					throw RangeError("encode: overflow (1)");
				}

				delta += (m - n) * (h + 1);
				n = m;

				for (j = 0; j < input_length; ++j) {
					ijv = input[j];

					if (ijv < n && ++delta > this.maxint) {
						throw RangeError("encode: overflow (2)");
					}

					if (ijv == n) {
						/* Represent delta as a generalized variable-length
							integer: */

						for (q = delta, k = this.base; ; k += this.base) {
							t = k <= bias ? this.tmin : k >= bias + this.tmax ?
										this.tmax : k - bias;

							if (q < t) {
								break;
							}

							output.push(String.fromCharCode(
								this.encode_digit(t + (q - t) %
									(this.base - t), 0)));

							q = Math.floor((q - t) / (this.base - t));
						}

						output.push(String.fromCharCode(this.encode_digit(q,
							preserveCase && case_flags[j] ? 1:0 )));

						bias = this.adapt(delta, h + 1, h == b);
						delta = 0;
						++h;
					}
				}

				++delta, ++n;
			}

			return output.join("");
		}
	}
}});
