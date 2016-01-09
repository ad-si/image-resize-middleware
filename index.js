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
			callback(error)
			if (image.callback)
				image.callback(error)
			return
		}

		console.log(
			'Thumbnail:',
			image.absolutePath, '->', image.absoluteThumbnailPath
		)

		if (image.callback)
			image.callback(null, image.absoluteThumbnailPath)

		let nextImage = idleQueue.pop()

		if (nextImage) {
			worker.image = nextImage
			convert(nextImage)
		}
		else
			callback()
	}

	function convert (image) {

		const pathDirectories = image.absoluteThumbnailPath.split('/')
		pathDirectories.pop()

		mkdirp(
			path.normalize(pathDirectories.join('/')),
			(error) => {
				if (error)
					callback(error)

				// TODO: Just try to create file and handle error
				if (fs.existsSync(image.absoluteThumbnailPath)) {
					callback()
					return
				}

				// TODO: Use streams to directly stream the response
				gm(image.absolutePath)
					.autoOrient()
					.resize(image.width, image.height, image.modifier)
					.noProfile()
					.write(
						image.absoluteThumbnailPath,
						error => afterWrite(error, image)
					)
			}
		)
	}

	convert(firstImage)
}


function addWorker () {
	const currentImage = idleQueue.pop()

	if (!currentImage)
		return

	const worker = {
		id: new Date(),
		image: currentImage
	}

	workers.push(worker)

	workOffQueue(
		worker,
		currentImage,
		() => workers.splice(workers.indexOf(worker), 1)
	)
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
		const fileExtension = path.extname(fileUrl.pathname)
		const fileName = path.basename(fileUrl.pathname, fileExtension)
		const width = Number(fileUrl.query.width)
		const height = Number(fileUrl.query.height)
		const maxWidth = Number(fileUrl.query['max-width'])
		const maxHeight = Number(fileUrl.query['max-height'])

		// Skip middleware if…
		if (
			!isImage(fileUrl.pathname) || // is not an image or
			!(width || height || maxWidth || maxHeight) // has no size parameter
		) {
			next()
			return
		}

		const calculatedWidth = maxWidth || width
		const calculatedHeight = maxHeight || height

		let modifier = '!'

		if (maxWidth || maxHeight)
			modifier = '>'

		const thumbnailName = fileName + '_' +
			calculatedWidth + 'x' + calculatedHeight + modifier +
			fileExtension

		const image = {
			absolutePath: path.join(basePath, fileUrl.pathname),
			absoluteThumbnailPath: path.join(thumbnailsPath, thumbnailName),
			modifier,
			width: calculatedWidth,
			height: calculatedHeight,
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
