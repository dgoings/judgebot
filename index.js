var Botkit = require('botkit');
var Promise = this.Promise || require('promise');
var request = require('superagent-promise')(require('superagent'), Promise);

var os = require('os');

var controller = Botkit.slackbot({
    debug: true,
});

var bot = controller.spawn({
    token: "xoxb-20344580834-kKWgntqfR5Wc7e7cQftT4lrc"
}).startRTM();

// Flat table matching the names of all our added slack emojis
// Would be nice to find a way to not have this hardcoded, maybe through
// the Slack api?
var manaSymbols = {
  "W": "white",
  "U": "blue",
  "B": "black",
  "R": "red",
  "G": "green",
  "C": "colorless",
  "W/B": "wb",
  "W/U": "wu",
  "U/B": "ub",
  "U/R": "ur",
  "B/G": "bg",
  "B/R": "br",
  "R/G": "rg",
  "R/W": "rw",
  "G/U": "gu",
  "G/W": "gw",
  "W/P": "pw",
  "U/P": "pu",
  "B/P": "pb",
  "R/P": "pr",
  "G/P": "pg",
  "T": "tap",
  "Q": "untap",
}

// takes an oracle text mana cost and replaces 
// {cost} with the appropriate emoji, if available
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

// expects the id of a card, then makes a robust api call
// and parses through the results for that card id, returning
// the full details of that card. Also pages through
// results recursively if necessary.
var getDetailedCardData = function(name, page) {
  var pageNum = (page)? page : 1;
  return new Promise(function(resolve, reject) {
    request.get('https://magidex.com/api/search?q='+name+'&p='+pageNum)
      .set('Accept', 'application/json')
      .end()
      .then(function onResult(res) {
        if (res.status == 200 && res.body.results.length) {
          var results = res.body.results, match;
          for(var i = 0; i < results.length; i++) {
            if (results[i].name == name) { match = results[i]; break; }
          }
          if (match) {
            resolve(match);
          } else if (res.body.metadata.resultSet.pages > pageNum) {
            var card = getDetailedCardData(name, page++);
            card.then(function(val) {
              resolve(val);
            }).catch(function(err) {
              reject(err);
            });
          } else {
            reject("No match found");
          }
        } else {
          reject(res.status);
        }
      }, function onError(err) {
        reject(err.status);
      });
  });
}

// expects a card object and constructs a bot reply with
// the card details
var constructReplyMessage = function(card) {
  if (card == null) return;
  var reply = '<http://gatherer.wizards.com/Pages/Card/Details.aspx?multiverseid='+card.multiverseid+'|'+card.name+'>';
  if (card.manaCost) reply += ' ' + manacostToEmoji(card.manaCost);
  reply += ' | ' + card.type;
  if (card.power !== null && card.toughness !== null) reply += ' | ' + card.power + '/' + card.toughness;
  if (card.text) reply += '\n' + card.text;

  // Needed for clients that don't allow rich formatting
  var fallback = card.name;
  if (card.manaCost) fallback += ' ' + card.manaCost; 
  fallback += ' | ' + card.type;

  return {attachments: [{ fallback: fallback, pretext: reply }]};
}

// listens for cardnames prepended with a !
// Right now just grabs everything after the !, no smart parsing,
// can't do multiple cards in a single message
controller.hears(['!(\\w+[\\w\\s,-\.]*)'],'direct_message,direct_mention,mention',function(bot,message) {

  var matches = message.text.match(/!(\w+[\w\s-,_\.]*)/i);
  var cardname = encodeURIComponent(matches[1].trim());
  var card, cardDetail;
  request.get('https://magidex.com/api/typeahead?q='+cardname)
    .set('Accept', 'application/json')
    .end()
    .then(function onResult(res) {
      if (res.status == 200 && res.body.length) {
        card = res.body[0]; // fallback if we can't match the full card
        cardDetail = getDetailedCardData(card.id);
        cardDetail.then(function(card) {
          // note the card here for the message is the returned value from getDetailedCardData
          bot.reply(message, constructReplyMessage(card));
        }).catch(function(err) {
          // the card here for the message is our original fallback
          // yay function scope
          bot.reply(message, constructReplyMessage(card));
        });
      }
    }, function onError(err) {
      // this should probably be a message to the chat that we couldn't find the card(s)
      console.log("Error: " + err);
    });
});
