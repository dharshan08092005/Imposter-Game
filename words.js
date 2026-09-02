const WORD_BANK = {
  "Animals": [
    "TIGER", "LION", "ELEPHANT", "GIRAFFE", "DOLPHIN", 
    "PENGUIN", "KANGAROO", "MONKEY", "PANDA", "RABBIT", 
    "CAT", "DOG", "HORSE", "EAGLE", "SHARK", "OCTOPUS"
  ],
  "Food": [
    "PIZZA", "BURGER", "SUSHI", "PASTA", "CHOCOLATE", 
    "COFFEE", "APPLE", "BANANA", "ICE_CREAM", "TACO", 
    "SALAD", "CHEESE", "BREAD", "CAKE", "PANCAKE", "HONEY"
  ],
  "Places": [
    "BEACH", "MOUNTAIN", "HOSPITAL", "SCHOOL", "AIRPORT", 
    "LIBRARY", "MUSEUM", "PARK", "HOTEL", "CINEMA", 
    "RESTURANT", "STADIUM", "DESERT", "FOREST", "ISLAND", "OFFICE"
  ],
  "Objects": [
    "PHONE", "CAMERA", "GUITAR", "BICYCLE", "WATCH", 
    "CHAIR", "TABLE", "KEY", "BOOK", "MIRROR", 
    "CLOCK", "BOTTLE", "UMBRELLA", "GLASSES", "WALLET", "BACKPACK"
  ],
  "Activities": [
    "RUNNING", "SWIMMING", "COOKING", "READING", "DANCING", 
    "SINGING", "PAINTING", "TRAVELING", "SHOPPING", "SLEEPING", 
    "FISHING", "CAMPING", "GARDENING", "WRITING", "DRIVING", "HIKING"
  ],
  "Movies": [
    "AVATAR", "TITANIC", "INCEPTION", "GLADIATOR", "JAWS", 
    "FROZEN", "MATRIX", "BATMAN", "SUPERMAN", "TARZAN", 
    "SHREK", "ALADDIN", "DRACULA", "JURASSIC_PARK", "COCO", "AMELIE"
  ],
  "Sports": [
    "CRICKET", "FOOTBALL", "BASKETBALL", "TENNIS", "GOLF", 
    "BOXING", "CHESS", "VOLLEYBALL", "BASEBALL", "RUGBY", 
    "BADMINTON", "HOCKEY", "SURFING", "SKIING", "BOWLING", "KARATE"
  ],
  "Nature": [
    "RAIN", "SNOW", "SUN", "MOON", "RIVER", 
    "OCEAN", "STAR", "CLOUD", "WIND", "FLOWER", 
    "TREE", "FIRE", "VOLCANO", "LIGHTNING", "RAINBOW", "LAKE"
  ],
  "Technology": [
    "LAPTOP", "INTERNET", "ROBOT", "SOFTWARE", "WEBSITE", 
    "KEYBOARD", "MOUSE", "SCREEN", "PRINTER", "BATTERY", 
    "CHARGER", "HEADPHONES", "ROUTER", "CAMERA", "AI", "GAMEPAD"
  ],
  "Everyday things": [
    "TEACHER", "SHOES", "PENCIL", "PAPER", "COAT", 
    "WINDOW", "DOOR", "KEYS", "SOAP", "TOWEL", 
    "BED", "PILLOW", "BRUSH", "CUP", "SPOON", "COIN"
  ]
};

// Select a random word ensuring it doesn't match the last few words
function getRandomWord(excludeList = []) {
  const categories = Object.keys(WORD_BANK);
  const randomCategory = categories[Math.floor(Math.random() * categories.length)];
  const words = WORD_BANK[randomCategory];
  
  // Filter out any excluded words
  const availableWords = words.filter(word => !excludeList.includes(word));
  
  if (availableWords.length === 0) {
    // If all words are excluded (which is highly unlikely with a large bank), fall back to any word
    const fallbackWord = words[Math.floor(Math.random() * words.length)];
    return { category: randomCategory, word: fallbackWord };
  }
  
  const randomWord = availableWords[Math.floor(Math.random() * availableWords.length)];
  return { category: randomCategory, word: randomWord };
}

module.exports = {
  WORD_BANK,
  getRandomWord
};
