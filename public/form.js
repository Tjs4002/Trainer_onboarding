/* Trainer onboarding form: capture geolocation, preview files, submit. */
(function () {
  'use strict'

  var form = document.getElementById('form')
  var errorEl = document.getElementById('error')
  var submitBtn = document.getElementById('submit')
  var locCard = document.getElementById('locCard')
  var locStatus = document.getElementById('locStatus')
  var locCoords = document.getElementById('locCoords')
  var locBtn = document.getElementById('locBtn')

  // Captured geolocation, filled in asynchronously if the user allows it.
  var geo = { lat: null, lng: null, acc: null, at: null }

  /* --------------------------- geolocation --------------------------- */
  function setLocState(state, statusText) {
    locCard.classList.remove('is-loading', 'is-ok', 'is-error')
    if (state) locCard.classList.add('is-' + state)
    locStatus.textContent = statusText
  }

  function requestLocation() {
    if (!('geolocation' in navigator)) {
      setLocState('error', 'Location is not supported on this device.')
      locCoords.hidden = true
      locBtn.hidden = true
      return
    }
    setLocState('loading', 'Getting your location…')
    locCoords.hidden = true
    locBtn.hidden = true

    navigator.geolocation.getCurrentPosition(
      function (pos) {
        geo.lat = pos.coords.latitude
        geo.lng = pos.coords.longitude
        geo.acc = pos.coords.accuracy
        geo.at = Math.floor(Date.now() / 1000)
        setLocState('ok', 'Location captured')
        locCoords.textContent =
          geo.lat.toFixed(5) + ', ' + geo.lng.toFixed(5) +
          (geo.acc ? ' (±' + Math.round(geo.acc) + ' m)' : '')
        locCoords.hidden = false
        locBtn.textContent = 'Update location'
        locBtn.hidden = false
        locBtn.disabled = false
      },
      function (err) {
        var msg =
          err && err.code === 1
            ? 'Location permission was denied. You can still submit, or tap below to allow it.'
            : 'Could not get your location. Tap below to try again.'
        setLocState('error', msg)
        locCoords.hidden = true
        locBtn.textContent = 'Load location'
        locBtn.hidden = false
        locBtn.disabled = false
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  locBtn.addEventListener('click', function () {
    locBtn.disabled = true
    requestLocation()
  })

  // Capture as soon as the page opens.
  requestLocation()

  /* ----------------------------- previews ---------------------------- */
  function wirePreview(inputName, previewId) {
    var input = form.elements[inputName]
    var img = document.getElementById(previewId)
    if (!input || !img) return
    input.addEventListener('change', function () {
      var file = input.files && input.files[0]
      if (!file || !/^image\//.test(file.type)) {
        img.hidden = true
        img.removeAttribute('src')
        return
      }
      img.src = URL.createObjectURL(file)
      img.hidden = false
    })
  }
  wirePreview('photo', 'photoPreview')
  wirePreview('passbook', 'passbookPreview')

  /* ------------------------------ submit ----------------------------- */
  function showError(msg, field) {
    errorEl.textContent = msg
    errorEl.hidden = false
    errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
    if (field && form.elements[field]) {
      try { form.elements[field].focus() } catch (e) {}
    }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault()
    errorEl.hidden = true

    var fd = new FormData(form)
    if (geo.lat != null) {
      fd.set('latitude', String(geo.lat))
      fd.set('longitude', String(geo.lng))
      fd.set('geo_accuracy_m', String(geo.acc))
      fd.set('geo_captured_at', String(geo.at))
    }

    submitBtn.disabled = true
    submitBtn.textContent = 'Submitting...'

    fetch('/api/submit', { method: 'POST', body: fd })
      .then(function (res) {
        return res.json().then(function (body) {
          return { status: res.status, body: body }
        })
      })
      .then(function (r) {
        if (r.status === 200 && r.body && r.body.ok) {
          document.getElementById('refId').textContent = r.body.id
          form.parentElement.hidden = true
          document.getElementById('done').hidden = false
          window.scrollTo(0, 0)
          return
        }
        showError((r.body && r.body.error) || 'Submission failed. Please try again.', r.body && r.body.field)
        submitBtn.disabled = false
        submitBtn.textContent = 'Submit'
      })
      .catch(function () {
        showError('Network error. Please check your connection and try again.')
        submitBtn.disabled = false
        submitBtn.textContent = 'Submit'
      })
  })
})()
