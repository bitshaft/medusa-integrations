# Parcel points

How the plugin keeps carriers' parcel point lists (lockers and pickup points)
and answers the storefront's point picker.

## Why the lists live in the database

Apaczka returns a carrier's whole list in one response. Measured on
production data in November 2026 (Poland):

| Carrier (Apaczka type)   | Points | JSON    |
| ------------------------ | ------ | ------- |
| InPost (`INPOST`)        | 33,241 | 21.3 MB |
| DPD (`DPD`)              | 34,518 |         |
| GLS (`GLS`)              | 26,490 |         |
| DHL (`DHL`)              | 24,343 |         |
| Poczta Polska (`POCZTA`) | 22,784 |         |
| Orlen Paczka (`PWR`)     | 13,217 |         |

Parsed in Node, InPost alone takes about 45 MB, because Apaczka sends opening
hours as a per-day object for every point. Three carriers would take about
130 MB, held twice (the module and the fulfillment provider each had a
copy), which doesn't fit a small server next to Medusa. So each list is
stored in Postgres and searched with SQL; only one list is ever in memory,
for a few seconds while it is being synced.

## Tables

`apaczka_point`, one row per point:

| Column                                                            |                                                                 |
| ----------------------------------------------------------------- | --------------------------------------------------------------- |
| `type`, `country_code`                                            | The list: Apaczka points type (`INPOST`, `DPD`…) and country    |
| `external_id`                                                     | Apaczka's `foreign_address_id`, e.g. `WAW41N`; unique per list  |
| `subtype`, `name`                                                 | e.g. `parcel_locker`, "Przy sklepie Lewiatan"                   |
| `line1`, `line2`, `street`, `house_number`, `postal_code`, `city` | Address                                                         |
| `latitude`, `longitude`                                           | Numbers (Apaczka sends text); null when missing                 |
| `open_hours`                                                      | As sent (JSON): text or `{ mon: [["08:00","20:00"]], … }`       |
| `open_hours_summary`                                              | Short form for lists: `24/7`, `Mon–Fri 08:00–20:00`             |
| `accepts_cod`, `accepts_delivery`, `accepts_sending`              | Filters                                                         |
| `image_url`, `additional_info`                                    |                                                                 |
| `search`                                                          | Lowercase, no diacritics: code, name, street, city, postal code |
| `synced_at`                                                       | The sync that last saw the point                                |

Indexes: unique `(type, country_code, external_id)`;
`(type, country_code, latitude, longitude)` for map areas and distance;
`(type, country_code, synced_at)` for removing closed points.

`apaczka_point_sync`, one row per list: `source` (where the stored list came
from: `demo`, `production`, `sandbox`), `status` (`idle`, `running`,
`failed`), `started_at`, `finished_at`, `succeeded_at`, `point_count`,
`error`. The row doubles as the lock that keeps two processes from syncing
the same list.

## Keeping lists fresh

There is no scheduled job: a server that sleeps (e.g. a Heroku Eco dyno)
would miss it. Searches decide instead (`ApaczkaPointDirectory`):

1. A search answers from the stored list right away.
2. If the list is older than `pointsTtlMinutes` (default 12 hours), a
   refresh starts in the background. Customers keep getting the stored
   list meanwhile; the next search after the refresh gets the new one.
3. Only when a carrier has no usable list (never synced, or synced from
   another source) does the search wait for the first sync.
4. One sync per list at a time: calls in a process share it, and the lock
   row keeps other processes out. A sync still marked running after 10
   minutes is treated as dead and taken over.
5. After a failed sync the stored list keeps being used, and the next
   attempt waits 15 minutes, so an Apaczka outage is not hammered. With no
   list stored, searches fail until then with "Parcel points for INPOST are
   not available right now". They never say why: the store API is public,
   and Apaczka's error (e.g. a bad signature) would tell anyone the keys
   don't work. The cause goes to the log and the list's state in the admin.

A sync downloads the list, writes it in batches of 500 in one transaction
(insert or update by `external_id`), deletes the list's points it didn't see,
and records the count. Readers see the old list until the transaction
commits. Point types the account doesn't have, and countries outside
`pointCountries`, are rejected before anything is fetched, so the public
store API can't be used to fill the database.

**Settings → Parcel points** in the admin lists every carrier with its
count, last sync and state, and "Sync now" fills a list in advance. It is
refused within 5 minutes of the list's last attempt, so repeated clicks
can't turn into repeated downloads of the whole list; when a sync fails, it
says why. A store with a public demo admin should keep this route away from
it.

## Demo mode and live points

With `demo: true`, the sample points (16, in six cities) go through the same
tables. With `demo: true, livePoints: true`, the lists are the account's
real points while services, prices, shipments, labels, pickups and tracking
stay demo. A stored list from another source (the samples) is replaced
before it is used.

Apaczka keys can't be limited, so in this mode they live in one place only
(`createApaczkaClient`): a function that sends the points request. The demo
client holds that function, not a client, so nothing that reaches it can
send another request with the keys, and printing or serializing it shows
none. The options the module and the provider keep have placeholder keys
(`withoutDemoCredentials`), so routes, workflows and anything that logs the
options never see the real ones; that also makes a demo store reject real
Apaczka webhooks. `demo-keys.spec.ts` checks the module, the provider and
the admin responses for the key.

## Searching

`GET /store/apaczka/points` takes one of:

- `q`: every word must appear in the search text (`"bytom"`, `"41-902"`,
  `"BYT01M"`). The best matches come first: the point's own code, then the
  city itself, a city starting with the text, a postal code starting with
  it, so `"łódź"` lists Łódź before Aleksandrów Łódzki;
- `lat` and `lng`: nearest first, with `distance_km`;
- `bbox=west,south,east,north`: points inside a map area (with `limit` up to
  500), for loading what a map shows as it moves;

plus `cod` and `sending` filters.

A zoomed-out map uses `GET /store/apaczka/points/clusters?type=…&bbox=…&zoom=…`
instead: Postgres groups the area's points into grid cells (`clusterGrid`:
about 85 pixels at that zoom, on a grid fixed at 0°, 0° so cells don't move
while the map pans) and returns one row per cell with its count, average
position and extent. The whole of Poland at country zoom is a few dozen
clusters, and no point leaves the database. Zoomed in to about a district,
load the points themselves with `bbox`.

The checkout's point check
(`validateFulfillmentData`) looks the chosen point up by `external_id` in the
same table, so a point can be chosen only if it is in the stored list.

## Size

About 0.6–0.9 KB per point with indexes: roughly 55–85 MB for InPost, DPD
and DHL, 105–160 MB for all carriers above. Only carriers that customers
actually search are synced.
