import asyncio
import websockets
import RPi.GPIO as GPIO
import time
import json

# Import the WS2812 module.
from neopixel import *
import board
from pi_io import *

# Configure the count of pixels:
N = 8
# Set the server port
PORT = 8000

# You can set DEBUG to True to receive logging on standard output.
DEBUG = True
#DEBUG = False

# Some WS2812 strips use GRB for the color order. Set the color order using COLOR_ORDER.
#COLOR_ORDER = "RGB"
COLOR_ORDER = "GRB"

pixels = NeoPixel(board.D18, 16)

async def socketHandler(websocket, path):
  async def button_callback(pressed):
    await websocket.send(json.dumps({'name': 'button1', 'value': pressed}))
  BUTTON1.register_callback(button_callback)

  async def rotary_callback(counter):
    await websocket.send(json.dumps({'name': 'rotary1', 'value': counter}))
  ROTARY1.register_callback(rotary_callback)

  try:
    while True:
      cmdLine = await websocket.recv()
      cmdList = cmdLine.split(" ")
      command = cmdList.pop(0)
      if DEBUG:
        print("> Received command:", cmdLine)

      # Process the command
      if command == "init":
        # Initialize the led strip.
        if DEBUG:
          print(">> Initializing WS2812 strip...")

        # Clear all the pixels to turn them off.
        if DEBUG:
          print(">> Clearing all", N, "pixels...")
        pixels.fill((0, 0, 0))
        
        ROTARY1.reset()

        # The init command replies with the number of pixels on the strip.
        await websocket.send(json.dumps({'name': 'init', 'value': str(N)}))

      elif command == "clear":
        if DEBUG:
          print(">> Handling clear command")
        pixels.fill((0, 0, 0))

      elif command == "setpixel":
        if DEBUG:
          print(">> Handling setpixel command")
        pix = int(cmdList.pop(0))
        red = int(cmdList.pop(0))
        green = int(cmdList.pop(0))
        blue = int(cmdList.pop(0))
        pixels[pix % N] = (red, green, blue)

      elif command == "setpixels":
        if DEBUG:
          print(">> Handling setpixels command")
        red = int(cmdList.pop(0))
        green = int(cmdList.pop(0))
        blue = int(cmdList.pop(0))
        for pix in range(N):
            pixels[pix] = (red, green, blue)

      elif command == "shift":
        if DEBUG:
          print(">> Handling shift command")
        direction=cmdList.pop(0)
        if direction == "left":
          if DEBUG:
            print(">> Shifting left...")
          leftmostPixelColor = pixels.getPixelColor(0)
          if pixelCount < N:
            if DEBUG:
              print(">>Handling virtual pixels for", pixelCount, "virtual pixels over",N,"real pixels")
            nrIterations = N // pixelCount
            for i in range(0, nrIterations):
              for pix in range(1, pixelCount):
                color = pixels.getPixelColor(i*pixelCount+pix)
                pixels.setPixelColor(i*pixelCount+pix-1,color)
              pixels.setPixelColor((i+1)*pixelCount-1,leftmostPixelColor)
            if N % pixelCount > 0:
              i = 0
              for pix in range(nrIterations*pixelCount,N):
                color = pixels.getPixelColor(i)
                pixels.setPixelColor(pix,color)
                i = i + 1
          else:
            for pix in range(1, N):
              color = pixels.getPixelColor(pix)
              pixels.setPixelColor(pix-1,color)
            pixels.setPixelColor(N-1,leftmostPixelColor)
          if autoShow:
            pixels.show()
        elif direction == "right":
          if DEBUG:
            print(">> Shifting right...")
          rightmostPixelColor = pixels.getPixelColor(pixelCount-1)
          if pixelCount < N:
            if DEBUG:
              print(">>Handling virtual pixels for", pixelCount, "virtual pixels over",N,"real pixels")
            nrIterations = N // pixelCount
            if N % pixelCount > 0:
              for pix in reversed(range(nrIterations*pixelCount,N)):
                color = pixels.getPixelColor(pix-1)
                pixels.setPixelColor(pix,color)
            for i in range(0, nrIterations):
              for pix in reversed(range(1, pixelCount)):
                color = pixels.getPixelColor(i*pixelCount+pix-1)
                pixels.setPixelColor(i*pixelCount+pix,color)
              pixels.setPixelColor(i*pixelCount,rightmostPixelColor)
          else:
            for pix in reversed(range(1,N)):
              color = pixels.getPixelColor(pix-1)
              pixels.setPixelColor(pix,color)
            pixels.setPixelColor(0,rightmostPixelColor)
          if autoShow:
            pixels.show()
        else:
          print(">> Unknown shift direction:", direction)

      elif command == "dim":
        if DEBUG:
          print(">> Handling dim command")
        step = int(cmdList.pop(0))
        for i in range(N):
          color = pixels.getPixelColor(i)
          red = (color >> 16) & 0xFF
          green = (color >> 8) & 0xFF
          blue = color & 0xFF

          red = int(max(0, red - step))
          green = int(max(0, green - step))
          blue = int(max(0, blue - step))

          pixels.setPixelColorRGB(i,red,green,blue)
        if autoShow:
          pixels.show()

      elif command == "autoshow":
        if DEBUG:
          print(">> Handling autoshow command")
        state = cmdList.pop(0)
        if state == "on":
          autoShow = True
        elif state == "off":
          autoShow = False
        else:
          print(">> Unknown state for autoshow:", state)

      elif command == "show":
        if DEBUG:
          print(">> Handling show command")
        pixels.show()

      elif command == "setVirtualPixels":
        if DEBUG:
          print(">> Handling setVirtualPixels")
        nrPixels = int(cmdList.pop(0))
        pixelCount = nrPixels

      else:
        print(">> Unknown command:", command)

  except websockets.exceptions.ConnectionClosed:
    if DEBUG:
      print("> Disconnected.")
  except:
    print("> Unknown exception encountered.")
    raise

async def watch_io():
  while True:
    for d in DEVICES:
      d.watch()
    await asyncio.sleep(0.05)

print("WS2812 server starting...")
start_server = websockets.serve(socketHandler, '0.0.0.0', PORT)

print("> Websocket initialized. Now entering main loop...")
loop = asyncio.get_event_loop()
loop.run_until_complete(start_server)
loop.create_task(watch_io())
loop.run_forever()
