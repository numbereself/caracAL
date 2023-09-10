## Changelog

Here you can review the historic development of caracAL.

I do not bundle releases but with the timestamp you can usually find the relevant git commit.

### Better 🌲 __logging__

#### 2023-09-09

##### npm install required

##### BREAKING CHANGES

This update updates the internal logging to use JSON format powered by [pino](https://www.npmjs.com/package/pino "the logging framework pino").

This enables significantly better formatting of console output, including which character sent a log and colored logs.

The logfiles were moved into a separate logs folder but are still subject to logrotate.

For more details see the README about [🌲Logging](./README.md#🌲logging "logging section of README.md").

Also, I updated localStorage.

It is no longer stored as a single json file but as newline-delimited json (ndjson/jsonl) with one key per line.
The filename is now `localStorage/caraGarage.jsonl`.
Existing localStorage should get migrated automatically.

Large files should no longer lock up the application, but it will take more storage space in the process.

Behind the scenes I have done a lot of refactoring to make the codebase more maintainable. I will continue to do so as I add new features.  
Notably I will migrate many console calls in the codebase to the new logging.

#### 2023-02-01

Fix a bug where parent.X may be empty when starting new characters.

#### 2022-10-24

Add support for graceful shutdown. This enables the client function on_destroy to be called before a client is regenerated (shutdown as well as server switches).
The calculations have a 500 ms window, after which they will be force terminated.

#### 2022-09-27

Fixes for storage.json sometimes being completely empty.
If caracAL worked for you and you werent getting `Unexpected end of JSON input` you dont need to update.

#### 2022-09-08

Minor bugfixes with a larger impact.
smart_move should now be usable again.
Also special characters are now respected in login process

### The localStorage update

#### 2021-10-17

##### npm install required

This update finally introduces localStorage and sessionStorage. However, in order to provide these technologies we need to bring in additional dependencies. Follow the steps below to upgrade to the most recent version. This version renames the default scripts. The default code file `example.js` now resides in `caracAL/examples/crabs.js`. If you were running the default crab script please edit or regenerate your config file in order to match the changed filename. 