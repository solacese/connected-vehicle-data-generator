import log from 'loglevel';

import { appConfig } from './config.js'
import * as route from './route.js'
import { Vehicle } from './vehicle.js';
import mqtt from 'mqtt';


// vehicle controller
const vc = {
  mqttClient: null,
  routes: {},
  vehicles: {},

  // initialize everything based on configuration
  init: function () {
    // init all routes
    for (const r of appConfig.routes) {
      let coordinates = route.deduplicateCoordinates(r.coordinates)
      coordinates = route.oneWay2RoundTrip(coordinates)
      vc.routes[r.id] = coordinates
    }

    // init vehicles
    for (const vehConfig of appConfig.vehicles) {
      // create route segments for specified speed
      const distancePerSecond = vehConfig.speed * 1000 / 3600
      const line = route.segment(vc.routes[vehConfig.route], distancePerSecond)
      for (let i = 1; i <= vehConfig.number; i++) {
        const vehicle = new Vehicle()
        Object.assign(vehicle, {
          "id": vehConfig.IDPrefix + i.toString().padStart(4, "0"),
          "line": line,
          "curtIdx": getRandomInt(line.length),
        })
        Object.assign(vehicle, vehConfig)
        vc.vehicles[vehicle.id] = vehicle
      }
    }
  },

  initMqtt: function (onConnected) {
    // connect to broker
    vc.mqttClient = mqtt.connect(appConfig.mqtt)
    vc.mqttClient.on('connect', function () {
      log.info("Connected, ready to send mqtt messages ...")
      onConnected()
    })

    vc.mqttClient.on('message', function (topic, message) {
      console.warn("Received message: " + message.toString())
    })


    vc.mqttClient.on('error', (err) => {
      log.error("Mqtt Client Error: " + err.message)
      vc.mqttClient.end()
      process.exit()
    })
  },

  start: function () {
    vc.initMqtt(() => vc.startAllVehicles())
  },

  // start all vehicles
  startAllVehicles: function () {
    for (const [vehId, vehicle] of Object.entries(vc.vehicles)) {
      setTimeout(() => {
        vehicle.move()
        setInterval(() => vehicle.move(), 1000 * vehicle.reportInterval)
      }, Math.random() * 1000 * vehicle.reportInterval)
    }
  },


  onVehicleReport: function (payload) {
    const topic = `acmeResources/veh_trak/gps/v2/${payload.route}/${payload.vehType}/${payload.vehID}/` +
      `${payload.lat.toFixed(5).padStart(9, "0")}/${payload.lng.toFixed(5).padStart(10, "0")}/` +
      `${payload.heading.toFixed(0)}/${payload.status}`
    vc.mqttClient.publish(topic, JSON.stringify(payload))
    log.debug(topic)
  }
}


function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}

export { vc as vehicleController }