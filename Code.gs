// Update utility settings
HighQualityUtils.settings().enableDevMode()
HighQualityUtils.settings().disableYoutubeApi()
HighQualityUtils.settings().setAuthToken(ScriptProperties)

// Get channels from database
const spreadsheetBotId = 2
const channels = HighQualityUtils.channels().getAll()

/**
 * Add any channels that don't exist in the database and update any that do exist.
 */
function synchronizeChannels() {
  const channelSheet = HighQualityUtils.spreadsheets().getById("16PLJOqdZOdLXguKmUlUwZfu-1rVXzuJLHbY18BUSOAw").getSheet("channels")
  const channelValues = channelSheet.getValues()

  const dbMissingChannels = []
  const dbExistingChannels = []

  channelValues.forEach(valueArr => {
    // Since the data is from a sheet instead of the database or youtube, create the object manually
    const sheetChannel = {
      "id": valueArr[0],
      "visible": true,
      "title": valueArr[1],
      "description": valueArr[5],
      "publishedAt": valueArr[4],
      "wiki": valueArr[2],
      "viewCount": valueArr[8],
      "subscriberCount": valueArr[7],
      "videoCount": valueArr[6],
      "channelStatus": valueArr[3],
      "author": spreadsheetBotId
    }

    // If a channel with this ID exists in the database
    if (channels.some(channel => channel.getId() === sheetChannel.id) === true) {
      dbExistingChannels.push(sheetChannel)
    } else {
      dbMissingChannels.push(sheetChannel)
    }
  })

  const channelPath = HighQualityUtils.channels().getApiPath()

  // Post missing objects to insert into the database
  if (dbMissingChannels.length > 0) {
    console.log(`Posting ${dbMissingChannels.length} channels to database`)
    HighQualityUtils.database().postData(channelPath, dbMissingChannels)
  }

  // Put everything else to update the database
  if (dbExistingChannels.length > 0) {
    console.log(`Updating ${dbExistingChannels.length} channels in database`)
    HighQualityUtils.database().putData(channelPath, dbExistingChannels)
  }
}

/**
 * Add any videos that don't exist in the database and update any that do exist.
 */
function synchronizeVideos() {
  const sheetVideos  = new Map()

  // Get videos from the channel sheets
  channels.forEach(channel => {
    console.log(channel.getDatabaseObject().title)
    // Loop through each of the sheet's rows
    channel.getSheet().getValues().forEach(valueArr => {
      // Since the data is from a sheet instead of the database or youtube, create the object manually
      sheetVideos.set(valueArr[0], {
        "id": valueArr[0],
        "visible": true,
        "publishedAt": valueArr[4],
        "title": valueArr[1],
        "description": valueArr[6].toString().replace(/NEWLINE/g, "\n"),
        "duration": valueArr[5],
        "viewCount": valueArr[7],
        "likeCount": valueArr[8],
        "dislikeCount": valueArr[9],
        "commentCount": valueArr[10],
        "wikiStatus": valueArr[2],
        "videoStatus": valueArr[3],
        "author": spreadsheetBotId,
        "channel": channel.getId()
      })
    })
  })

  // Get videos from the database
  const videoPath = HighQualityUtils.videos().getApiPath()
  const dbVideosArr = HighQualityUtils.database().getData(videoPath).results.filter(dbObject => dbObject.visible === true)
  const dbVideos = new Map(dbVideosArr.map(dbVideo => [dbVideo.id, dbVideo]))

  const sheetMissingVideos = []
  const dbMissingVideos = []
  const dbExistingVideos = []

  // Find objects missing from database
  // TODO continue from previous run to get around only being able to push a limited number of objects at a time
  sheetVideos.forEach(sheetVideo => {
    if (dbVideos.has(sheetVideo.id) === false) {
      if (dbMissingVideos.length < 5) dbMissingVideos.push(sheetVideo)
    } else {
      if (dbExistingVideos.length < 5) dbExistingVideos.push(sheetVideo)
    }
  })

  // Find objects missing from sheets
  dbVideos.forEach(dbVideo => {
    if (sheetVideos.has(dbVideo.id) === false) {
      sheetMissingVideos.push(dbVideo)
    }
  })

  console.log("Missing from sheets:   ", sheetMissingVideos.length, sheetMissingVideos[0])
  console.log("Missing from database: ", dbMissingVideos.length, dbMissingVideos[0])
  console.log("Existing in database:  ", dbExistingVideos.length, dbExistingVideos[0])

  // Post missing objects to insert into the database
  if (dbMissingVideos.length > 0) {
    console.log(`Posting ${dbMissingVideos.length} videos to database`)
    HighQualityUtils.database().postData(videoPath, dbMissingVideos)
  }

  // Put everything else to update the database
  if (dbExistingVideos.length > 0) {
    console.log(`Updating ${dbMissingVideos.length} videos in database`)
    HighQualityUtils.database().putData(videoPath, dbExistingVideos)
  }

  // Warn of missing objects in the sheets
  if (sheetMissingVideos.length > 0) {
    console.warn(`Found ${sheetMissingVideos.length} videos missing from sheets:\n`, sheetMissingVideos)
  }
}

/**
 * Add videos from a playlist to their respective spreadsheet.
 */
function addVideosFromPlaylist() {
  HighQualityUtils.settings().enableYoutubeApi()
  const playlistId = "PLJ6iE9ACR2nosV37Ks61oEJzieEYPxaT4"
  const [videos] = HighQualityUtils.videos().getByPlaylistId(playlistId)
  console.log(`Found ${videos.length} videos in playlist`)

  videos.forEach(video => {
    const channel = video.getChannel()
    const sheet = channel.getSheet()
    const metadata = video.getOriginalObject()

    if (sheet.getValues().some(row => row[0] === video.getId()) === true) {
      console.log(`"${video.getId()}" has already been added`)
      return
    }

    console.log(`Adding "${video.getId()}" to "${sheet.getSpreadsheet().getId()}"`)

    const videoRow = [[
      HighQualityUtils.utils().formatYoutubeHyperlink(video.getId()),
      metadata.title,
      video.getWikiStatus(),
      video.getYoutubeStatus(),
      HighQualityUtils.utils().formatDate(metadata.publishedAt),
      metadata.duration,
      metadata.description.toString().replace(/\n/g, "NEWLINE"),
      metadata.viewCount,
      metadata.likeCount,
      0, // dislike count
      metadata.commentCount
    ]]

    sheet.insertValues(videoRow)
  })
}
