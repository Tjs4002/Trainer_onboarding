/* Admin: load submissions with a bearer token, render a table with file links. */
(function () {
  'use strict'

  var tokenEl = document.getElementById('token')
  var loadBtn = document.getElementById('load')
  var msg = document.getElementById('msg')
  var countEl = document.getElementById('count')
  var table = document.getElementById('table')
  var rows = document.getElementById('rows')

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]
    })
  }

  function when(ts) {
    try { return new Date(ts * 1000).toLocaleString() } catch (e) { return String(ts) }
  }

  function socials(s) {
    var out = []
    if (s.instagram) out.push('IG: ' + esc(s.instagram))
    if (s.facebook) out.push('FB: ' + esc(s.facebook))
    if (s.twitter) out.push('X: ' + esc(s.twitter))
    return out.join('<br>') || '&mdash;'
  }

  function location(s) {
    if (s.latitude == null) return '&mdash;'
    var ll = s.latitude.toFixed(5) + ', ' + s.longitude.toFixed(5)
    var url = 'https://www.google.com/maps?q=' + s.latitude + ',' + s.longitude
    var acc = s.geo_accuracy_m ? ' (±' + Math.round(s.geo_accuracy_m) + 'm)' : ''
    return '<a class="file" href="' + url + '" target="_blank" rel="noopener">' + ll + '</a>' + acc
  }

  function fileLink(s, kind, token) {
    var key = s[kind + '_key']
    if (!key) return ''
    var url = '/api/admin/file/' + encodeURIComponent(s.id) + '/' + kind + '?token=' + encodeURIComponent(token)
    var label = kind === 'photo' ? 'Photo' : 'Passbook'
    return '<a class="file" href="' + url + '" target="_blank" rel="noopener">' + label + '</a>'
  }

  function render(list, token) {
    rows.innerHTML = ''
    list.forEach(function (s) {
      var tr = document.createElement('tr')
      tr.innerHTML =
        '<td>' + when(s.created_at) + '</td>' +
        '<td>' + esc(s.name) + '</td>' +
        '<td>' + esc(s.region) + '</td>' +
        '<td>' + esc(s.postal_address) + '<br><code>' + esc(s.pincode) + '</code></td>' +
        '<td>' + (s.has_laptop ? 'Yes' : 'No') + '</td>' +
        '<td>' + socials(s) + '</td>' +
        '<td><code>' + esc(s.bank_name || '') + '<br>A/C ' + esc(s.bank_account_number) + '<br>' + esc(s.bank_ifsc) + '</code></td>' +
        '<td>' + location(s) + '</td>' +
        '<td>' + [fileLink(s, 'photo', token), fileLink(s, 'passbook', token)].filter(Boolean).join('<br>') + '</td>'
      rows.appendChild(tr)
    })
  }

  function load() {
    var token = tokenEl.value.trim()
    if (!token) return
    msg.hidden = true
    loadBtn.disabled = true
    loadBtn.textContent = 'Loading...'

    fetch('/api/admin/submissions', { headers: { authorization: 'Bearer ' + token } })
      .then(function (res) { return res.json().then(function (b) { return { status: res.status, body: b } }) })
      .then(function (r) {
        loadBtn.disabled = false
        loadBtn.textContent = 'Load'
        if (r.status !== 200 || !r.body.ok) {
          msg.textContent = r.body && r.body.error ? r.body.error : 'Failed to load'
          msg.hidden = false
          table.hidden = true
          countEl.hidden = true
          return
        }
        render(r.body.submissions, token)
        countEl.textContent = r.body.submissions.length + ' submission(s)'
        countEl.hidden = false
        table.hidden = false
      })
      .catch(function () {
        loadBtn.disabled = false
        loadBtn.textContent = 'Load'
        msg.textContent = 'Network error'
        msg.hidden = false
      })
  }

  loadBtn.addEventListener('click', load)
  tokenEl.addEventListener('keydown', function (e) { if (e.key === 'Enter') load() })
})()
