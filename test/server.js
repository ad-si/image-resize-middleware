'use strict'

const express = require('express')
const app = express()
const imageResizer = require('../index.js')

module.exports = (port, isListeningCallback) => {
	app.use(imageResizer.getMiddleware({
		basePath: __dirname
	}))
	app.use(express.static(__dirname))

	app.listen(port, () => {
		console.log('Test app is listening on http://localhost:' + port)
		isListeningCallback()
	})
}
