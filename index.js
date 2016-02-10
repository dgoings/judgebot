var Botkit = require('botkit');
var request = require('superagent');

var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: "xoxb-20344580834-kKWgntqfR5Wc7e7cQftT4lrc"
}).startRTM();

var manaSymbols = {
  "W": "white",
  "U": "blue",
  "B": "black",
  "R": "red",
  "G": "green"
}

var manacostToEmoji = function(manacost) {
  var re = /\{(.{1,3})\}/g;
  var cost = manacost,
    convertedCost = '',
    result, symbol;

  do {
    result = re.exec(cost);
    symbol = result[1];
    convertedCost += (manaSymbols[symbol]) ? ':'+manaSymbols[symbol]+':' : result[0];
  } while (re.lastIndex < cost.length);

  return convertedCost;
}

// give the bot something to listen for.
controller.hears(['!(\\w+[\\w\\s,-\.]*)'],'direct_message,direct_mention,mention',function(bot,message) {

  var matches = message.text.match(/!(\w+[\w\s-,_\.]*)/i);
  var cardname = encodeURIComponent(matches[1].trim());
  request.get('https://magidex.com/api/search?q='+cardname)
    .set('Accept', 'application/json')
    .end(function(err, res) {
      if (res && res.text && res.text !== 'null') {
        var response = JSON.parse(res.text);
        if (response.results.length) {
          console.log('Results: ', response.results);
          var card = response.results[0];
          var reply = '<http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid='+card.multiverseid+'|'+card.name+'>';
          if (card.manaCost) reply += ' ' + manacostToEmoji(card.manaCost);
          reply += ' | ' + card.type;
          if (card.power !== null && card.toughness !== null) reply += ' | ' + card.power + '/' + card.toughness;
          reply += '\n' + card.text;
          bot.reply(message, {attachments: [{ pretext: reply }]});
        }
      }
      if (err) {
        console.log("Error: " + err);
      }
    });
});
