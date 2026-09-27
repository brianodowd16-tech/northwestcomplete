/* Gasworks House — availability calendar and booking request form. */
(function () {
	'use strict';

	var cfg = window.GWH_BOOKING;
	var calEl = document.querySelector('[data-cal]');
	var form = document.querySelector('[data-book-form]');
	if (!cfg || !calEl || !form) return;

	var summaryEl = form.querySelector('[data-summary]');
	var statusEl = form.querySelector('[data-book-status]');
	var submitBtn = form.querySelector('[data-book-submit]');
	var arrivalInput = form.querySelector('[data-arrival]');
	var departureInput = form.querySelector('[data-departure]');
	var guestsInput = form.querySelector('input[name="guests"]');

	var DAY = 86400000;
	var blocked = {};
	var arrival = null;
	var departure = null;
	var view = null;
	var message = '';

	/* ---------- Date helpers (UTC, Y-m-d strings) ---------- */
	function parse(s) { var p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
	function fmt(t) { return new Date(t).toISOString().slice(0, 10); }
	function add(s, n) { return fmt(parse(s) + n * DAY); }
	function nightsBetween(a, d) { return Math.round((parse(d) - parse(a)) / DAY); }
	function nice(s, opts) {
		return new Date(parse(s)).toLocaleDateString('en-IE', Object.assign({ timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }, opts || {}));
	}
	function money(n) {
		return '€' + n.toLocaleString('en-IE', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
	}
	function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }

	function setBlocked(ranges) {
		blocked = {};
		(ranges || []).forEach(function (r) {
			for (var d = r[0], i = 0; d < r[1] && i < 800; d = add(d, 1), i++) blocked[d] = true;
		});
	}
	function isFree(night) { return night >= cfg.today && !blocked[night]; }
	function rangeFree(a, d) {
		for (var n = a; n < d; n = add(n, 1)) if (!isFree(n)) return false;
		return true;
	}

	/* ---------- Pricing (mirrors gwh_quote() on the server) ---------- */
	function quote(a, d, guests) {
		var p = cfg.pricing;
		var extra = Math.max(0, guests - p.baseGuests);
		var base = 0, extras = 0, priced = true;
		for (var n = a; n < d; n = add(n, 1)) {
			var dow = new Date(parse(n)).getUTCDay();
			var weekend = dow === 5 || dow === 6;
			var rate = weekend ? p.weekend : p.weekday;
			if (!(rate > 0)) priced = false;
			base += rate;
			extras += extra * (weekend ? p.weekendExtra : p.weekdayExtra);
		}
		return {
			nights: nightsBetween(a, d), extraGuests: extra, base: base, extras: extras, priced: priced,
			total: priced ? base + extras + p.cleaning : 0
		};
	}
	function guestCount() {
		var g = parseInt(guestsInput.value, 10);
		return g > 0 ? Math.min(g, cfg.maxGuests) : 0;
	}

	/* ---------- Selection ---------- */
	function pick(day) {
		message = '';
		if (!arrival || departure) {
			if (!isFree(day)) return;
			arrival = day;
			departure = null;
		} else if (day > arrival && rangeFree(arrival, day)) {
			if (nightsBetween(arrival, day) < cfg.minNights) {
				message = 'The minimum stay is ' + cfg.minNights + ' nights.';
			} else {
				departure = day;
			}
		} else if (isFree(day)) {
			arrival = day;
		} else {
			message = 'Those dates include nights that are already booked.';
		}
		sync();
	}

	function canClick(day) {
		if (arrival && !departure && day > arrival) return rangeFree(arrival, day);
		return isFree(day);
	}

	function sync() {
		arrivalInput.value = arrival || '';
		departureInput.value = departure || '';
		render();
		renderSummary();
	}

	/* ---------- Calendar ---------- */
	function monthsShown() { return window.matchMedia('(min-width: 720px)').matches ? 2 : 1; }

	function firstOfMonth(s) { return s.slice(0, 8) + '01'; }
	function addMonths(s, n) {
		var d = new Date(parse(s));
		return fmt(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
	}

	function render() {
		var todayMonth = firstOfMonth(cfg.today);
		var lastMonth = addMonths(todayMonth, 23);
		if (!view) view = todayMonth;
		var count = monthsShown();

		var html = '<div class="cal-nav">' +
			'<button type="button" class="cal-arrow" data-nav="-1" aria-label="Previous month"' + (view <= todayMonth ? ' disabled' : '') + '>‹</button>' +
			'<button type="button" class="cal-arrow" data-nav="1" aria-label="Next month"' + (addMonths(view, count - 1) >= lastMonth ? ' disabled' : '') + '>›</button>' +
			'</div><div class="cal-months">';

		for (var m = 0; m < count; m++) {
			var month = addMonths(view, m);
			var d = new Date(parse(month));
			var title = d.toLocaleDateString('en-IE', { timeZone: 'UTC', month: 'long', year: 'numeric' });
			var offset = (d.getUTCDay() + 6) % 7; // Monday first
			var days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();

			html += '<div class="cal-month"><p class="cal-title">' + title + '</p><div class="cal-grid" role="grid">';
			['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].forEach(function (w) { html += '<span class="cal-dow">' + w + '</span>'; });
			for (var i = 0; i < offset; i++) html += '<span></span>';

			for (var day = 1; day <= days; day++) {
				var s = month.slice(0, 8) + (day < 10 ? '0' : '') + day;
				var cls = ['cal-day'];
				if (s < cfg.today) cls.push('is-past');
				else if (blocked[s]) cls.push('is-booked');
				if (arrival && s === arrival) cls.push('is-start');
				if (departure && s === departure) cls.push('is-end');
				if (arrival && departure && s > arrival && s < departure) cls.push('is-in');
				if (s === cfg.today) cls.push('is-today');
				var clickable = s >= cfg.today && canClick(s);
				html += '<button type="button" class="' + cls.join(' ') + '" data-day="' + s + '"' +
					(clickable ? '' : ' disabled') +
					' aria-label="' + nice(s, { year: 'numeric' }) + (blocked[s] ? ', booked' : '') + '"' +
					(s === arrival || s === departure ? ' aria-pressed="true"' : '') + '>' + day + '</button>';
			}
			html += '</div></div>';
		}
		html += '</div>';
		if (message) html += '<p class="cal-msg" role="alert">' + message + '</p>';
		calEl.innerHTML = html;
	}

	calEl.addEventListener('click', function (e) {
		var btn = e.target.closest('button');
		if (!btn || btn.disabled) return;
		if (btn.hasAttribute('data-nav')) {
			view = addMonths(view, +btn.getAttribute('data-nav'));
			render();
		} else if (btn.hasAttribute('data-day')) {
			pick(btn.getAttribute('data-day'));
		}
	});

	var lastCount = monthsShown();
	window.addEventListener('resize', function () {
		if (monthsShown() !== lastCount) { lastCount = monthsShown(); render(); }
	});

	/* ---------- Summary ---------- */
	function renderSummary() {
		if (!arrival) {
			summaryEl.innerHTML = '<p class="summary-empty">Tap your arrival date, then your departure date.</p>';
			return;
		}
		if (!departure) {
			summaryEl.innerHTML = '<p class="summary-dates">' + nice(arrival) + ' → <em>pick departure</em></p>' +
				'<p class="summary-empty">Minimum stay ' + cfg.minNights + ' nights. Check-in from ' + cfg.checkin + '.</p>';
			return;
		}
		var p = cfg.pricing;
		var guests = guestCount();
		var q = quote(arrival, departure, guests);
		var plural = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
		var html = '<p class="summary-dates">' + nice(arrival) + ' → ' + nice(departure, { year: 'numeric' }) +
			' <span>· ' + plural(q.nights, 'night') + '</span></p>';
		if (q.priced) {
			html += '<dl class="summary-price">' +
				'<div><dt>' + plural(q.nights, 'night') + ', up to ' + p.baseGuests + ' guests</dt><dd>' + money(q.base) + '</dd></div>' +
				(q.extras ? '<div><dt>' + plural(q.extraGuests, 'extra guest') + ' × ' + plural(q.nights, 'night') + '</dt><dd>' + money(q.extras) + '</dd></div>' : '') +
				(p.cleaning ? '<div><dt>Cleaning</dt><dd>' + money(p.cleaning) + '</dd></div>' : '') +
				'<div class="summary-total"><dt>Total' + (guests ? ' for ' + guests + ' guests' : '') + '</dt><dd>' + money(q.total) + '</dd></div></dl>';
			if (!guests) {
				html += '<p class="summary-note">Enter your group size below. Over ' + p.baseGuests + ' guests: +' + money(p.weekendExtra) +
					' per extra person per night at weekends, +' + money(p.weekdayExtra) + ' midweek.</p>';
			}
		} else {
			html += '<p class="summary-note">We\'ll confirm your price by email.</p>';
		}
		if (p.deposit) {
			html += '<p class="summary-note">' + money(p.deposit) + ' damage deposit taken as a card pre-authorisation (a hold, not a charge), released after your stay.</p>';
		}
		html += '<button type="button" class="summary-clear" data-clear>Clear dates</button>';
		summaryEl.innerHTML = html;
	}

	summaryEl.addEventListener('click', function (e) {
		if (e.target.closest('[data-clear]')) { arrival = departure = null; message = ''; sync(); }
	});

	/* ---------- Typed dates (keyboard users, no-JS parity) ---------- */
	function fromInputs() {
		var a = arrivalInput.value, d = departureInput.value;
		message = '';
		if (isDate(a) && isFree(a)) {
			arrival = a;
			view = firstOfMonth(a) < firstOfMonth(cfg.today) ? firstOfMonth(cfg.today) : firstOfMonth(a);
			if (isDate(d) && d > a && rangeFree(a, d) && nightsBetween(a, d) >= cfg.minNights) {
				departure = d;
			} else {
				departure = null;
				if (isDate(d)) message = d <= a ? 'Departure must be after arrival.' : (!rangeFree(a, d) ? 'Those dates include nights that are already booked.' : 'The minimum stay is ' + cfg.minNights + ' nights.');
			}
		} else if (isDate(a)) {
			arrival = departure = null;
			message = a < cfg.today ? 'That date has passed.' : 'That arrival date is already booked.';
		}
		render();
		renderSummary();
	}
	guestsInput.addEventListener('input', renderSummary);
	arrivalInput.addEventListener('change', fromInputs);
	departureInput.addEventListener('change', fromInputs);
	arrivalInput.min = departureInput.min = cfg.today;

	/* ---------- Submit ---------- */
	function showStatus(text, ok) {
		statusEl.hidden = false;
		statusEl.textContent = text;
		statusEl.className = 'notice ' + (ok ? 'notice-ok' : 'notice-err');
	}

	form.addEventListener('submit', function (e) {
		e.preventDefault();
		if (!arrival || !departure) {
			showStatus('Please choose your arrival and departure dates on the calendar.', false);
			calEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
			return;
		}
		if (!form.reportValidity()) return;

		var data = {};
		new FormData(form).forEach(function (v, k) { data[k] = v; });
		submitBtn.disabled = true;
		submitBtn.textContent = 'Sending…';

		fetch(cfg.request, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(data),
			credentials: 'omit'
		})
			.then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
			.then(function (res) {
				if (res.ok && res.body && res.body.ok) {
					form.innerHTML = '<div class="book-done"><p class="book-done-title">🎉 Request sent!</p><p>' +
						(res.body.message || 'We\'ll be in touch within 24 hours.') + '</p><p class="summary-dates">' +
						nice(arrival) + ' → ' + nice(departure, { year: 'numeric' }) + '</p></div>';
					var r = [arrival, departure];
					arrival = departure = null;
					setBlocked(currentRanges.concat([r]));
					render();
				} else {
					showStatus((res.body && res.body.message) || 'Sorry, something went wrong. Please try again.', false);
					if (res.body && res.body.data && res.body.data.status === 409) refresh();
				}
			})
			.catch(function () { showStatus('Sorry, we couldn\'t send that. Please check your connection and try again.', false); })
			.then(function () {
				if (submitBtn.isConnected) { submitBtn.disabled = false; submitBtn.textContent = 'Request to book'; }
			});
	});

	/* ---------- Load ---------- */
	var currentRanges = cfg.blocked || [];
	function refresh() {
		// The page itself may be cached, so fetch live availability.
		fetch(cfg.availability, { cache: 'no-store', credentials: 'omit' })
			.then(function (r) { return r.json(); })
			.then(function (live) {
				if (!live || !live.blocked) return;
				cfg = Object.assign(cfg, live);
				currentRanges = live.blocked;
				setBlocked(currentRanges);
				if (arrival && (!isFree(arrival) || (departure && !rangeFree(arrival, departure)))) {
					arrival = departure = null;
					message = 'Sorry, the dates you picked have just been booked.';
				}
				sync();
			})
			.catch(function () {});
	}

	setBlocked(currentRanges);
	sync();
	refresh();
})();
