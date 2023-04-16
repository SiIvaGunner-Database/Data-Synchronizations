// IMPORTANT! Enable dev mode when testing.
// HighQualityUtils.settings().enableDevMode()
HighQualityUtils.settings().disableYoutubeApi()
HighQualityUtils.settings().setAuthToken(ScriptProperties)

// Get channels from database
const spreadsheetBotId = HighQualityUtils.settings().getBotId()
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
    const developmentSpreadsheet = (
      valueArr[1] === "1Q_L84zZ2rzS57ZcDcCdmxMsguqjpnbLGr5_QVX5LVKA" // if bootleg rips database
      ? "1JhARnRkPEtwGFGgmxIBFoWixB7QR2K_toz38-tTHDOM" // then bootleg rips database
      : "1uRgcmhoRNBPabK0JnTpjUxxaickBH0iGCXRrSDhkxO0" // else main rips database
    )

    // Since the data is from a sheet instead of the database or youtube, create the object manually
    const sheetChannel = {
      "id": valueArr[0],
      "visible": true,
      "title": valueArr[2],
      "description": valueArr[6],
      "publishedAt": valueArr[5],
      "wiki": valueArr[3],
      "viewCount": valueArr[9],
      "subscriberCount": valueArr[8],
      "videoCount": valueArr[7],
      "channelStatus": valueArr[4],
      "developmentSpreadsheet": developmentSpreadsheet,
      "productionSpreadsheet": valueArr[1],
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
  const dbVideoLimit = 500
  const sheetVideos  = []
  const channelIndexKey = "channelIndex"
  const videoIndexKey = "videoIndex"

  // Number will default to 0 if a value doesn't exist
  const channelIndex = Number(ScriptProperties.getProperty(channelIndexKey))
  const videoIndex = Number(ScriptProperties.getProperty(videoIndexKey))
  const channel = channels[channelIndex]

  // Get videos from the channel sheets
  console.log(channel.getDatabaseObject().title)
  // Loop through each of the sheet's rows
  channel.getSheet().getValues().forEach(valueArr => {
    // If the ID isn't known, use the first 11 digits of the title
    if (valueArr[0] === "") {
      valueArr[0] = valueArr[1].replace(/\s+/g, '').substring(0, 11)
    }

    // Since the data is from a sheet instead of the database or youtube, create the object manually
    sheetVideos.push({
      "id": valueArr[0],
      "visible": true,
      "publishedAt": valueArr[4],
      "title": valueArr[1],
      "description": valueArr[6].toString().replace(/NEWLINE/g, "\n"),
      "duration": valueArr[5],
      "viewCount": valueArr[7] || 0,
      "likeCount": valueArr[8] || 0,
      "dislikeCount": valueArr[9] || 0,
      "commentCount": valueArr[10] || 0,
      "wikiStatus": valueArr[2],
      "videoStatus": valueArr[3],
      "author": spreadsheetBotId,
      "channel": channel.getId()
    })
  })

  // Get videos from the database
  const options = { "fields": "id" }
  const [dbVideosArr] = HighQualityUtils.videos().getByChannelId(channel.getId(), options)
  const dbVideos = new Map(dbVideosArr.map(dbVideo => [dbVideo.getId(), dbVideo.getOriginalObject()]))

  const dbMissingVideos = []
  const dbExistingVideos = []

  // Find database objects to update without going over the object limit
  for (let i = videoIndex; i < sheetVideos.length && dbMissingVideos.length + dbExistingVideos.length < dbVideoLimit; i++) {
    const sheetVideo = sheetVideos[i]

    if (dbVideos.has(sheetVideo.id) === false) {
      dbMissingVideos.push(sheetVideo)
    } else {
      dbExistingVideos.push(sheetVideo)
    }
  }

  console.log("Total in sheet: ", sheetVideos.length)
  console.log("Total in database: ", dbVideos.size)
  console.log("Missing from database: ", dbMissingVideos.length)
  console.log("Existing in database:  ", dbExistingVideos.length)

  const videoPath = HighQualityUtils.videos().getApiPath()

  // Post missing objects to insert into the database
  if (dbMissingVideos.length > 0) {
    console.log(`Posting ${dbMissingVideos.length} videos to database`)
    HighQualityUtils.database().postData(videoPath, dbMissingVideos)
  }

  // Put everything else to update the database
  if (dbExistingVideos.length > 0) {
    console.log(`Updating ${dbExistingVideos.length} videos in database`)
    HighQualityUtils.database().putData(videoPath, dbExistingVideos)
  }

  let nextChannelIndex = channelIndex
  let nextVideoIndex = videoIndex + dbVideoLimit

  // If this is the last of the videos to update for this channel
  if (nextVideoIndex >= sheetVideos.length - 1) {
    // If this is the last of the channels to update
    if (nextChannelIndex >= channels.length - 1) {
      nextChannelIndex = 0
    } else {
      nextChannelIndex = channelIndex + 1
    }

    nextVideoIndex = 0
  }

  ScriptProperties.setProperty(channelIndexKey, nextChannelIndex)
  ScriptProperties.setProperty(videoIndexKey, nextVideoIndex)
}

/**
 * Find unlisted videos on the wiki and add them to their respective sheet.
 */
function addMissingUnlistedVideos() {
  HighQualityUtils.settings().enableYoutubeApi()
  const wikis = ["siivagunner", "ttgd"]
  const category = "Unlisted rips"
  wikis.pop()

  wikis.forEach(wiki => {
    const categoryMembers = HighQualityUtils.utils().fetchFandomCategoryMembers(wiki, category)
    const videoIds = categoryMembers.map(categoryMember => HighQualityUtils.utils().fetchFandomVideoId(wiki, categoryMember.title))
    const videos = HighQualityUtils.videos().getByIds(videoIds)
    console.log(`Found ${videos.length} unlisted videos in ${wiki} wiki\n`)
    addVideosToSheet(videos)
  })
}

/**
 * Add videos from a playlist to their respective spreadsheet.
 * @param {String} playlistId - The playlist ID.
 */
function addVideosFromPlaylist(playlistId) {
  HighQualityUtils.settings().enableYoutubeApi()
  const [videos] = HighQualityUtils.videos().getByPlaylistId(playlistId)
  console.log(`Found ${videos.length} videos in playlist`)
  addVideosToSheet(video)
}

/**
 * Add videos to their respective spreadsheet.
 * @param {Array[VideoModel]} videos - The video objects.
 */
function addVideosToSheet(videos) {
  // Follows the form { channelId : { videoId : [...values], ...moreVideos }, ...moreChannels }
  const sheetValuesMap = new Map()

  videos.forEach(video => {
    if (video.getDatabaseObject() !== undefined) {
      console.log(`"${video.getId()}" exists in the database`)
    }

    const channel = video.getChannel()
    const sheet = channel.getSheet()
    const metadata = video.getOriginalObject()

    // If the values map doesn't have values for this channel yet, instantiate that map of values
    if (sheetValuesMap.has(channel.getId()) === false) {
      sheetValuesMap.set(channel.getId(), new Map(sheet.getValues().map(row => [row[0], row])))
    }

    if (sheetValuesMap.get(channel.getId()).has(video.getId()) === true) {
      console.log(`"${video.getId()}" has already been added`)
      return
    }

    console.log(`Adding "${video.getId()}" to "${sheet.getSpreadsheet().getId()}"`)

    const videoRow = [[
      HighQualityUtils.utils().formatYoutubeHyperlink(video.getId()),
      HighQualityUtils.utils().formatFandomHyperlink(metadata.title, channel.getDatabaseObject().wiki),
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
