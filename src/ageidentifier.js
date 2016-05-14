var TelegramBot = require('node-telegram-bot-api');
var request = require('request');
var messages = require('./common/messages');
var express = require('express');
var app = express();
var bodyParser = require('body-parser');

if (!process.env.TELEGRAM_BOT_TOKEN) throw new Error('You must provide TELEGRAM_BOT_TOKEN');
if (!process.env.MS_TOKEN) throw new Error('You must provide MS_TOKEN');
if (!process.env.PORT) throw new Error('You must provide PORT');

var bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {polling: process.env.NODE_ENV !== 'production'});

if (process.env.NODE_ENV === 'production') {
  bot.setWebHook(`https://ageidentifier.herokuapp.com/${bot.token}`);
} else {
  bot.setWebHook('');
}

var apiUrl = 'https://api.telegram.org/bot' + process.env.TELEGRAM_BOT_TOKEN + '/';
var fileUrl = 'https://api.telegram.org/file/bot' + process.env.TELEGRAM_BOT_TOKEN + '/';

bot.getMe().then(function (me) {
  console.log("BotName: %s; BotId: %s; BotUsername: %s", me.first_name, me.id, me.username);
});

bot.on('help', function (msg) {
  var messageChatId = msg.chat.id;
  sendMessageByBot(messageChatId, messages.HELP_MESSAGE);
});

bot.on('message', function (msg) {
  var sendTo = "";
  var messageChatId = msg.chat.id;
  console.log("\nMessage from: " + msg.chat.first_name + " " + msg.chat.last_name);
  var messageFileId;

  if (msg.photo) {
    messageFileId = msg.photo[0].file_id;
    var photoId = msg.photo[2].file_id;
    var urlJson;
    request.get(apiUrl + 'getFile?file_id=' + photoId, function (err, res, body) {
      if (!err && res.statusCode == 200) {
        // console.log(err + body);
        urlJson = body;
        var massUrl = JSON.parse(urlJson);
        // console.log( massUrl.result.file_path);
        var photoUrl = fileUrl + massUrl.result.file_path;

        var options = {
          "returnFaceId": 'true',
          "returnFaceLandmarks": "true",
          "returnFaceAttributes": "age,gender,smile"
        };

        request.post({
            uri: 'https://api.projectoxford.ai/face/v1.0/detect',
            headers: {'Ocp-Apim-Subscription-Key': process.env.MS_TOKEN},
            json: true,
            body: {url: photoUrl},
            qs: options
          },
          function (err, res, body) {
            message = "";
            smileRate = 0;

            if (!err && res.statusCode == 200) {
              faceJson = body;

              if (faceJson.length == 0) {
                message = messages.NO_PEOPLE;
                sendMessageByBot(messageChatId, message);
              } else if (!faceJson[0].faceAttributes) {
                message = messages.CANT_RECOGNISE_HUMAN;
                sendMessageByBot(messageChatId, message);
                console.log("Result: " + message);
              } else {
                message = "";
                var multi = 0;
                if (faceJson.length > 1) {
                  message += messages.MORE_THAN_ONE;
                  multi = 1;
                }
                for (var i = 0; i < faceJson.length; i++) {
                  var age = faceJson[i].faceAttributes.age;
                  var gender = faceJson[i].faceAttributes.gender;
                  if (gender === 'male') {
                    gender = messages.MALE;
                  } else if (gender === 'female') {
                    gender = messages.FEMALE;
                  }
                  if (multi) message += i + 1 + ". ";
                  var message = message + "Ты " + gender + " и тебе " + age + " годиков.";
                  if (!multi) {
                    smileRate = faceJson[i].faceAttributes.smile;

                    if (smileRate < 0.4) message += messages.SMILE_HARDER;
                    else message += messages.NICE_SMILE;
                  }
                  message += "\n";

                }
                sendMessageByBot(messageChatId, message);
                console.log('Result: ' + message + ' Smile' +
                  ' rate (don\'t mind if multiple: ' + smileRate + ')');
              }
            }
          });
      } else {
        console.log("Cannot parse picture" + res.statusCode + " ERROR: " + err);
      }
    });
  } else {
    sendMessageByBot(messageChatId, messages.HELLO_MESSAGE);
  }
});

function sendMessageByBot(chatId, message) {
  bot.sendMessage(chatId, message, {caption: 'Im cute bot'});
}

app.use(bodyParser.json());
app.get(`/`, (req, res) => res.redirect('http://telegram.me/AgeIdentifierBot'));
app.post(`/${process.env.TELEGRAM_BOT_TOKEN}`, (req, res) => {
  bot.processUpdate(req.body);
  res.sendStatus(200);
});
app.listen(process.env.PORT);

module.exports = bot;
