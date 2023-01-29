// Update utility settings
HighQualityUtils.settings().enableDevMode()
HighQualityUtils.settings().disableYoutubeApi()
HighQualityUtils.settings().setAuthToken(ScriptProperties)

// Get channels from database
const spreadsheetBotId = 2
const channels = HighQualityUtils.channels().getAll()

// TODO synchronize channels and playlists
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
        "description": valueArr[6].toString().replace(/NEWLINE/g, "\n"), //description,
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

  let sheetMissingVideos = []
  let dbMissingVideos = []
  let dbExistingVideos = []

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
      if (sheetMissingVideos.length < 5) sheetMissingVideos.push(dbVideo)
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
