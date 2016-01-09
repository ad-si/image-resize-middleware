'use strict'

const path = require('path')
const express = require('express')
const app = express()
const imageResizer = require('../index.js')
const basePath = __dirname
const thumbnailsPath = path.join(__dirname, 'thumbnails')


module.exports = (port, isListeningCallback) => {

	app.use(imageResizer.getMiddleware({basePath, thumbnailsPath}))
	app.use(express.static(__dirname))

	app.listen(port, () => {
		console.log('Test app is listening on http://localhost:' + port)
		isListeningCallback()
	})
}
