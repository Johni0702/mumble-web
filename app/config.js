// Note: You probably do not want to change any values in here because this
//       file might need to be updated with new default values for new
//       configuration options. Use the [config.local.js] file instead!

window.mumbleWebConfig = {
  // Default values (can be changed by passing a query parameter of the same name)
  'defaults': {
    // Connect Dialog
    'address': window.location.hostname,
    'port': '443',
    'token': '',
    'username': '',
    'password': '',
    'joinDialog': false, // replace whole dialog with single "Join Conference" button
    'matrix': false, // enable Matrix Widget support (mostly auto-detected; implies 'joinDialog')
    'avatarurl': '', // download and set the user's Mumble avatar to the image at this URL
    // General
    'theme': 'MetroMumbleLight'
  }
}
