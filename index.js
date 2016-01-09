'use strict'

const fs = require('fs')
const path = require('path')
const url = require('url')

const gm = require('gm')
const os = require('os')
const mkdirp = require('mkdirp')
const isImage = require('is-image')

const cpus = os.cpus()

const idleQueue = []
const workers = []


function workOffQueue (worker, firstImage, callback) {

	function afterWrite (error, image) {

		if (error) {
			console.error(error.stack)
			if (image.callback) image.callback(error)
			return
		}

		console.log('Created thumbnail for', image.absolutePath)

		if (typeof image.callback === 'function')
			image.callback(null, image. absoluteThumbnailPath)

		let nextImage = idleQueue.pop()

		if (nextImage) {
			worker.image = nextImage
			convert(nextImage)
		}
		else
			callback()
	}

	function convert (image) {

		let width = image.width || image.maxWidth || 200
		let height = image.height || image.maxHeight || 200
		let pathDirectories = image. absoluteThumbnailPath.split('/')
		pathDirectories.pop()

		mkdirp(path.normalize(pathDirectories.join('/')), function (error) {
			if (error)
				console.error(error.stack)

			// TODO: Just try to create file and handle error
			if (fs.existsSync(image. absoluteThumbnailPath)) {
				callback()
				return
			}

			// TODO: Use streams to directly stream the response
			gm(image.absolutePath)
				.autoOrient()
				.resize(width, height, '>')
				.noProfile()
				.write(image. absoluteThumbnailPath, function (error) {
					afterWrite(error, image)
				})
		})
	}

	convert(firstImage)
}


function addWorker () {

	var worker,
		currentImage = idleQueue.pop()


	if (currentImage) {

		worker = {
			id: new Date(),
			image: currentImage
		}

		workers.push(worker)

		workOffQueue(worker, currentImage, function () {
			workers.splice(workers.indexOf(worker), 1)
		})
	}

}

function addToQueue (image) {

	const positionInQueue = idleQueue
		.map(function (img) {
			return img.absolutePath
		})
		.indexOf(image.absolutePath)

	const processingWorker = workers
		.map(function (worker) {
			return worker.image.absolutePath
		})
		.indexOf(image.absolutePath)


	if (positionInQueue != -1 || processingWorker != -1)
		return

	idleQueue.push(image)

	if (workers.length < cpus.length)
		addWorker()
}

module.exports.addToQueue = addToQueue

module.exports.getMiddleware = function (options) {

	options = options || {}
	const thumbnailsPath = options.thumbnailsPath ||
		path.join(__dirname, 'thumbs')
	const basePath = options.basePath || global.basePath

	console.assert(basePath, 'BasePath is not specified')

	return function (request, response, next) {

		const fileUrl = url.parse(request.url, true)
		const maxWidth = Number(fileUrl.query['max-width'])
		const maxHeight = Number(fileUrl.query['max-height'])

		// Skip middleware if request is not for a scaled image
		if (!isImage(fileUrl.pathname) || !(maxWidth || maxHeight)) {
			next()
			return
		}

		const image = {
			absolutePath: path.join(basePath, fileUrl.pathname),
			absoluteThumbnailPath: path.join(thumbnailsPath, fileUrl.pathname),
			maxWidth,
			maxHeight,
			callback: (error, absoluteThumbnailPath) => {
				if (error) {
					next(error)
					return
				}

				fs
					.createReadStream(absoluteThumbnailPath)
					.pipe(response)
			},
		}

		const stream = fs.createReadStream(image.absoluteThumbnailPath)

		stream.on('error', (error) => {
			if (error.code !== 'ENOENT') {
				next(error)
				return
			}

			// Create thumbnail if it does not exist yet
			addToQueue(image)
		})

		stream.pipe(response)
	}
}
