# Open Source Tally Light

vTally is an Open Source Wifi Tally Light based on the ESP8266.

It aims to be affordable without sacrificing reliability and works with most
common video mixers.

Its architecture uses a central Hub that connects the tallies to the video mixer and
allows easy configuration and monitoring.

![Architecture Setup](documentation/docs/images/architecture.png)
uses icons from the Noun Project by 
[Eucalyp](https://thenounproject.com/browse/?i=3151803),
[Atif Arshad](https://thenounproject.com/browse/?i=1294543),
[priyanka](https://thenounproject.com/browse/?i=1637910),
[Hrbon](https://thenounproject.com/browse?i=3014911) and
[ProSymbols](https://thenounproject.com/browse/?i=1086042), all licensed [CC-BY-3.0](https://creativecommons.org/licenses/by/3.0/us/legalcode)

## Building and wiring a light

[Building a light](docs/building-a-light.md) walks through the five steps in the hub's Build a light page;
[Wiring a light](docs/wiring.md) has the drawings and pin tables for the common builds.

## Before the service

On the Tallies page, **Pre-service check** lists what must be true for the lights to work: the switcher
connected, every light online and on its own input, one vTally on the network, the lights' program current,
and the lights at full brightness. Each line says what to do. Its **walk test** flashes every light in turn,
in the switcher's order, so someone in the room can see each camera's light respond. Next to it, the
brightness button dims all lights at once for an evening service; it stays amber until they are back at full.

## Features

* WiFi Tally Light based on the ESP8266
* Hardware costs of about 10€
* flexible USB power (battery pack, camera outlet, stationary)
* Fast communication and lightweight protocol
* uses a central Hub to communicate, that allows easy monitoring
* utilizes your local network and access points
* support for RGB Leds (anode, cathode), WS2812, NeoPixel, etc
* alternatively: turn any device with a browser (smartphone, tablet) into a Tally
* Open Source / Open Hardware

## Getting Started

:arrow_forward: :arrow_forward: :arrow_forward: [Read the full documentation at wifi-tally.github.io](https://wifi-tally.github.io/) :arrow_backward: :arrow_backward: :arrow_backward:

## Status

![Build Status](https://github.com/wifi-tally/wifi-tally/workflows/build/badge.svg)
[![Cypress Tests](https://img.shields.io/endpoint?url=https://dashboard.cypress.io/badge/detailed/1qd2ua/master&style=flat&logo=cypress)](https://dashboard.cypress.io/projects/1qd2ua/runs)

![GitHub last commit](https://img.shields.io/github/last-commit/wifi-tally/wifi-tally)
![GitHub (Pre-)Release Date](https://img.shields.io/github/release-date-pre/wifi-tally/wifi-tally?label=latest%20release)
