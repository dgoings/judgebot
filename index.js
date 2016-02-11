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
var gameSymbols = {
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
    convertedCost += (gameSymbols[symbol]) ? ':'+gameSymbols[symbol]+':' : result[0];
  } while (re.lastIndex < cost.length);

  return convertedCost;
}

// expects the id of a card, then makes a robust api call
// and parses through the results for that card id, returning
// the full details of that card. Also pages through
// results recursively if necessary.
var getDetailedCardData = function(cardname, page) {
  console.log("Searching for detailed info for " + cardname);
  var pageNum = (page)? page : 1;
  return new Promise(function(resolve, reject) {
    request.get('https://magidex.com/api/search?q='+cardname+'&p='+pageNum)
      .set('Accept', 'application/json')
      .then(function onResult(res) {
        if (res.status == 200 && res.body.results.length) {
          var results = res.body.results, match;
          for(var i = 0; i < results.length; i++) {
            if (results[i].name == cardname) { match = results[i]; break; }
          }
          if (match) {
            console.log("Found detailed match");
            resolve(match);
          } else if (res.body.metadata.resultSet.pages > pageNum) {
            var card = getDetailedCardData(cardname, page++);
            card.then(function(val) {
              resolve(val);
            }).catch(function(err) {
              reject(err);
            });
          } else {
            reject("No match found");
          }
        } else {
          console.log("No cards found " + res.status);
          reject(res.status);
        }
      }, function onError(err) {
        console.log("Error search for cards " + err.status);
        reject(err.status);
      });
  });
}

// expects a card name and does a quick search for that card,
// returning a shallow card object that we can use to retrieve
// more data with getDetailedCardData
var simpleCardSearch = function(cardname) {
  console.log("Searching for card " + cardname);
  return new Promise(function(resolve, reject) {
    request.get('https://magidex.com/api/typeahead?q='+cardname)
      .set('Accept', 'application/json')
      .then(function onResult(res) {
        if (res.status == 200 && res.body.length) {
          console.log("Found a card");
          resolve(res.body[0]);
        } else if (cardname.search('%20') > -1) {
          var shorterName = cardname.split('%20').slice(0,-1).join('%20');
          var card = simpleCardSearch(shorterName);
          card.then(function(val) {
            resolve(val);
          }).catch(function(err) {
            reject(err);
          });
        } else {
          console.log("Couldn't find " + cardname);
          reject("No card found with that name.")
        }
      }, function onError(err) {
        console.log("Error searching for card " + err.status);
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
  if (card.power && card.toughness) reply += ' | ' + card.power + '/' + card.toughness;
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

  var searchText = message.text,
    cardnames = [],
    re = /!(\w+[\w\s-,_\.]*)/ig;

  // loop through all the instances of !cardname in the message
  do {
    result = re.exec(searchText);
    // we shouldn't ever need a cardname longer than 5 words
    cardnames.push(result[1].trim().replace('.', '').split(' ').splice(0,4).join(' '));
  } while (re.lastIndex < searchText.length);

  console.log("Cards to search: ", cardnames);

  // for each cardname found, call the api to find that card
  cardnames.forEach(function(cardname) {
    card = simpleCardSearch(encodeURIComponent(cardname));
    card.then(function(card) {
      console.log("Found card: ", card);
      cardDetail = getDetailedCardData(card.id);
      cardDetail.then(function(detailedCard) {
        console.log("Replying with detailed info");
        bot.reply(message, constructReplyMessage(detailedCard));
      }).catch(function(err) {
        console.log("Replying with fallback info");
        bot.reply(message, constructReplyMessage(card));
      });
    }).catch(function(err) {
      // this should probably be a message to the chat that we couldn't find the card(s)
      console.log("Error: ", err);
    });
  });
});
