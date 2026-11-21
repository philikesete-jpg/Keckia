import { parseGoogleCalendarIcs, parseGoogleCalendarJson, toFeedEvent, toTourSchedule } from '../src/lib/googleCalendarParser.ts';

const SAMPLE_GOOGLE_ICS = `BEGIN:VCALENDAR
PRODID:-//Google Inc//Google Calendar 70.9054//EN
VERSION:2.0
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:EritreaVisit Operations
BEGIN:VEVENT
DTSTART:20261112T073000Z
DTEND:20261112T170000Z
DTSTAMP:20261120T120000Z
UID:gcal_evt_101@google.com
SUMMARY:Flight LH 1234 Arrival - German Archaeological Expedition
DESCRIPTION:Group arrival at Asmara International Airport with 8 passengers. Guide Selam assigned.
LOCATION:Asmara International Airport (ASM)
STATUS:CONFIRMED
ATTENDEE;CN="Dr. Hans Gruber":mailto:hans@archaeology.de
ATTENDEE;CN="Greta Meier":mailto:greta@archaeology.de
COLOR:3
END:VEVENT
BEGIN:VEVENT
DTSTART;VALUE=DATE:20261115
DTEND;VALUE=DATE:20261118
UID:gcal_evt_102@google.com
SUMMARY:Dahlak Archipelago Marine & Coral Diving Expedition
DESCRIPTION:3-day private catamaran sailing around Dahlak Kebir, Madote and Dissei Islands.
LOCATION:Massawa Port & Dahlak Islands
STATUS:CONFIRMED
COLOR:7
END:VEVENT
END:VCALENDAR`;

console.log('Testing Google Calendar ICS Parser...');
const parsedFromIcs = parseGoogleCalendarIcs(SAMPLE_GOOGLE_ICS);
console.log(`Parsed ${parsedFromIcs.length} events from ICS.`);

if (parsedFromIcs.length !== 2) {
  throw new Error(`Expected 2 events, got ${parsedFromIcs.length}`);
}

const arrivalEvt = parsedFromIcs[0];
console.log('Arrival Event:', {
  summary: arrivalEvt.summary,
  start: arrivalEvt.start,
  allDay: arrivalEvt.allDay,
  colorHex: arrivalEvt.colorHex,
  isMovement: arrivalEvt.isMovement,
  attendees: arrivalEvt.attendees,
});

if (arrivalEvt.isMovement !== 'arrival') {
  throw new Error(`Expected isMovement to be arrival, got ${arrivalEvt.isMovement}`);
}
if (!arrivalEvt.attendees || arrivalEvt.attendees.length !== 2) {
  throw new Error(`Expected 2 attendees, got ${arrivalEvt.attendees?.length}`);
}

const feedEvt = toFeedEvent(arrivalEvt);
console.log('Converted FeedEvent:', {
  id: feedEvt.id,
  title: feedEvt.title,
  calendarName: feedEvt.calendarName,
  colorHex: feedEvt.colorHex,
});

const schedule = toTourSchedule(parsedFromIcs[1]);
console.log('Converted TourSchedule:', {
  id: schedule.id,
  tourTitle: schedule.tourTitle,
  startDate: schedule.startDate,
  endDate: schedule.endDate,
  destination: schedule.destination,
});

if (schedule.startDate !== '2026-11-15' || schedule.endDate !== '2026-11-18') {
  throw new Error(`Unexpected dates: ${schedule.startDate} - ${schedule.endDate}`);
}

console.log('Testing Google Calendar JSON Parser...');
const SAMPLE_JSON = {
  items: [
    {
      id: 'gcal_json_1',
      summary: 'Keren Cultural Camel Market Tour',
      description: 'Monday market day in Keren with colonial Italian railway station visit.',
      location: 'Keren, Anseba Region',
      start: { dateTime: '2026-11-23T08:00:00+03:00' },
      end: { dateTime: '2026-11-23T18:00:00+03:00' },
      colorId: '6', // Tangerine
      status: 'confirmed',
    },
  ],
};

const parsedFromJson = parseGoogleCalendarJson(SAMPLE_JSON);
console.log(`Parsed ${parsedFromJson.length} events from JSON.`);
if (parsedFromJson[0].colorHex !== '#f4511e') {
  throw new Error(`Expected Tangerine #f4511e, got ${parsedFromJson[0].colorHex}`);
}

console.log('ALL GOOGLE CALENDAR TESTS PASSED SUCCESSFULLY! ✅');
