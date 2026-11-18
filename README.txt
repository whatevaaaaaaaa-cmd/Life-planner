LIFE PLANNER, standalone app
============================

This folder is the whole app. It does not need Claude. Everything a person
enters is saved on their own phone.

FILES
  index.html              the app
  manifest.webmanifest    name, icon and colours used when installed
  sw.js                   lets the app open without a connection
  icon-180.png, icon-192.png, icon-512.png   app icons

PUT IT ONLINE (needed once, so phones can install it)
  Any web host that serves files over https will do. Upload the files in
  this folder, keeping them together, and you get a web address.
  Free options that accept a folder of files include Netlify, Cloudflare
  Pages and GitHub Pages.

INSTALL ON A PHONE
  Android: open the web address in Chrome, open the menu, choose
           "Add to Home screen" or "Install app".
  iPhone:  open the web address in Safari, tap Share, choose
           "Add to Home Screen".
  The app then opens full screen from its own icon, like any other app.

BACKUPS
  Settings (the gear on the first page) has "Save a backup" and
  "Restore a backup". Use them to move a planner to a new phone.

UPDATING
  When you replace the files with a newer version, change the VERSION
  text at the top of sw.js (for example life-planner-2) so phones pick
  up the new files.

APP STORES
  To list it in Google Play or the Apple App Store, this same folder is
  wrapped in a native shell (for example with Capacitor) and submitted
  through a Google Play developer account and an Apple developer account.
  Apple builds need a Mac with Xcode.
