/**
 * Author: Martin Doyle <martin.doyle@dakata.de>
 * Uses Sandeep Mistry's node-sensortag library (https://github.com/sandeepmistry/node-sensortag)
 */
'use strict';
var fs = require('fs');
var async = require('async');
var SensorTag = require('sensortag');
var mqtt = require('mqtt');

var configFile = 'config.json';
var config = JSON.parse(
    fs.readFileSync(configFile));
var SensorTags = config.SensorTags;
console.log(SensorTags);

SensorTag.SCAN_DUPLICATES = true;

// Timeout Variables
// Discovering is limited to timeoutVar
var timeoutVar = config.Timeout;
var timeoutID;
var timeoutCleared = true;

var temperatureEnabled = config.TemperatureEnabled;
var humidityEnabled = config.HumidityEnabled;
var barometricEnabled = config.BarometricEnabled;
var luxometerEnabled = config.LuxometerEnabled;

var intervalUpdate = config.Interval;
var intervalIDs = [];

// Configure and start MQTT connection
var mqttHost = config.MQTTHost;
var mqttPort = config.MQTTPort;
var mqttOptions = {
  host: mqttHost,
  port: mqttPort,
};

var topicStart = 'sensors/' + mqttOptions.username;
var mqttClient = mqtt.connect('mqtts://' + mqttHost + ':' + mqttPort, mqttOptions);

// For each SensorTag
function onDiscover(sensorTag) {
  var sensorTagID;
  sensorTagID = SensorTags.indexOf(sensorTag.uuid);
  if (sensorTagID > -1) {
    console.log('SensorTag ' + sensorTag.uuid + ' found');
  } else {
    console.log('SensorTag ' + sensorTag.uuid + ' not in list');
    return;
  }
  var deviceInfo = {};
  var deviceData = {};
  stopTimed();
  console.log('Sensortag discovered: ' + sensorTag);

  sensorTag.once('disconnect', function () {
    console.log('Sensortag disconnected.');
    if (timeoutCleared) {
      scanTimed();
    }
    clearInterval(intervalIDs[sensorTagID]);
  });

  // Set up SensorTag and send device information
  sensorTag.connectAndSetup(function () {
    var topic,
        tempString;
    console.log('Connect and setup');
    async.series([
          function (callback) {
            console.log('readDeviceName');
            sensorTag.readDeviceName(function (error, deviceName) {
              console.log('\tDevice Name = ' + deviceName);
              console.log('\tType = ' + sensorTag.type);
              console.log('\tUUID = ' + sensorTag.uuid);
              deviceInfo.deviceName = deviceName;
              deviceInfo.type = sensorTag.type;
              deviceInfo.uuid = sensorTag.uuid;
              callback();
            });
          },
          function (callback) {
            sensorTag.readFirmwareRevision(function (error, firmwareRevision) {
              console.log('\tFirmware Revision = ' + firmwareRevision);
              deviceInfo.firmwareRevision = firmwareRevision;
              callback();
            });
          },
          function (callback) {
            sensorTag.readManufacturerName(function (error, manufacturerName) {
              console.log('\tManufacturer = ' + manufacturerName);
              deviceInfo.manufacturerName = manufacturerName;
              callback();
            });
          }
        ],
        function (error, results) {
          if (error) {
            console.log(error);
          }
          topic = topicStart + '/' + sensorTag.uuid + '/deviceInfo';
          tempString = JSON.stringify(deviceInfo);
          console.log(topic + ' ' + tempString);
          mqttClient.publish(topic, tempString);
          scanTimed();
        }
    );

    function readSensors() {
      async.series([
            function (callback) {
              // Read IR temperature sensor values
              if (temperatureEnabled) {
                async.series([
                      function (cb) {
                        console.log('Enable IR Temperature Sensor ' + sensorTag.uuid);
                        sensorTag.enableIrTemperature(cb);
                      },
                      function (cb) {
                        setTimeout(cb, config.EnableTimeout);
                      },
                      function (cb) {
                        console.log('Read IR Temperature Sensor ' + sensorTag.uuid);
                        sensorTag.readIrTemperature(function (error, objectTemperature, ambientTemperature) {
                          tempString = objectTemperature.toFixed(2);
                          console.log(sensorTag.uuid + '/objectTemperature' + ' ' + tempString);
                          deviceData.objectTemperature = tempString;
                          tempString = ambientTemperature.toFixed(2);
                          console.log(sensorTag.uuid + '/ambientTemperature' + ' ' + tempString);
                          deviceData.ambientTemperature = tempString;
                          cb();
                        });
                      },
                      function (cb) {
                        console.log('Disable IR Temperature Sensor ' + sensorTag.uuid);
                        sensorTag.disableIrTemperature(cb);
                      }
                    ],
                    function (error, results) {
                      if (error) {
                        console.log(error);
                      }
                      console.log('IR Temperature read: ' + sensorTag.uuid);
                      callback(null, 'IR Temperature');
                    });
              } else {
                callback();
              }
            },
            function (callback) {
              // Read humidity sensor values
              if (humidityEnabled) {
                async.series([
                      function (cb) {
                        console.log('Enable Humidity Sensor ' + sensorTag.uuid);
                        sensorTag.enableHumidity(cb);
                      },
                      function (cb) {
                        setTimeout(cb, config.EnableTimeout);
                      },
                      function (cb) {
                        console.log('Read Humidity Sensor ' + sensorTag.uuid);
                        sensorTag.readHumidity(function (error, temperature, humidity) {
                          tempString = temperature.toFixed(2);
                          console.log(sensorTag.uuid + '/temperature' + ' ' + tempString);
                          deviceData.temperature = tempString;
                          tempString = humidity.toFixed(2);
                          console.log(sensorTag.uuid + '/humidity' + ' ' + tempString);
                          deviceData.humidity = tempString;
                          cb();
                        });
                      },
                      function (cb) {
                        console.log('Disable Humidity Sensor ' + sensorTag.uuid);
                        sensorTag.disableHumidity(cb);
                      }
                    ],
                    function (error, results) {
                      if (error) {
                        console.log(error);
                      }
                      console.log('Humidity read: ' + sensorTag.uuid);
                      callback(null, 'Humidity');
                    });
              } else {
                callback();
              }
            },
            function (callback) {
              // Read pressure sensor values
              if (barometricEnabled) {
                async.series([
                      function (cb) {
                        console.log('Enable Barometric Pressure Sensor ' + sensorTag.uuid);
                        sensorTag.enableBarometricPressure(cb);
                      },
                      function (cb) {
                        setTimeout(cb, config.EnableTimeout);
                      },
                      function (cb) {
                        console.log('Read Barometric Pressure Sensor ' + sensorTag.uuid);
                        sensorTag.readBarometricPressure(function (error, pressure) {
                          tempString = pressure.toFixed(2);
                          console.log(sensorTag.uuid + '/pressure' + ' ' + tempString);
                          deviceData.pressure = tempString;
                          cb();
                        });
                      },
                      function (cb) {
                        console.log('Disable Barometric Pressure Sensor ' + sensorTag.uuid);
                        sensorTag.disableBarometricPressure(cb);
                      }
                    ],
                    function (error, results) {
                      if (error) {
                        console.log(error);
                      }
                      console.log('Barometric Pressure read: ' + sensorTag.uuid);
                      callback(null, 'Barometric Pressure');
                    });
              } else {
                callback();
              }
            },
            function (callback) {
              // Read luxometer sensor values
              if (luxometerEnabled) {
                async.series([
                      function (cb) {
                        console.log('Enable Luxometer Sensor ' + sensorTag.uuid);
                        sensorTag.enableLuxometer(cb);
                      },
                      function (cb) {
                        setTimeout(cb, config.EnableTimeout);
                      },
                      function (cb) {
                        console.log('Read Luxometer Sensor ' + sensorTag.uuid);
                        sensorTag.readLuxometer(function (error, lux) {
                          tempString = lux.toFixed(2);
                          console.log(sensorTag.uuid + '/luxometer' + ' ' + tempString);
                          deviceData.lux = tempString;
                          cb(null, 'Luxometer');
                        });
                      },
                      function (cb) {
                        console.log('Disable Luxometer Sensor ' + sensorTag.uuid);
                        sensorTag.disableLuxometer(cb);
                      }
                    ],
                    function (error, results) {
                      if (error) {
                        console.log(error);
                      }
                      console.log('Luxometer read: ' + sensorTag.uuid);
                      callback(null, 'Luxometer');
                    });
              } else {
                callback();
              }
            }
          ],
          function (error, results) {
            if (error) {
              console.log(error);
            }
            topic = topicStart + '/' + sensorTag.uuid + '/deviceData';
            tempString = JSON.stringify(deviceData);
            console.log(topic + ' ' + tempString);
            mqttClient.publish(topic, tempString);
            console.log('Sensors read: ' + results + ' ' + sensorTag.uuid);
          });
    }

    // Set an interval, get and send SensorTag data
    intervalIDs[sensorTagID] = setInterval(readSensors, intervalUpdate);
  });
}

// Start timed discovering
function scanTimed() {
  console.log('Start discovering');
  timeoutCleared = false;
  SensorTag.discoverAll(onDiscover);
  timeoutID = setTimeout(function () {
    stopTimed();
  }, timeoutVar);
}

//Stop timer and discovering
function stopTimed() {
  SensorTag.stopDiscoverAll(onDiscover);
  timeoutCleared = true;
  console.log('Stop discovering');
  clearTimeout(timeoutID);
}

//Discover all SensorTags
scanTimed();
