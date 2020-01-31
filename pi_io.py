from RPi import GPIO
from time import sleep
import asyncio
from pigpio_encoder import pigpio_encoder

GPIO.setmode(GPIO.BCM)

loop = asyncio.get_event_loop()

class IO:
    def __init__(self):
        self.callback = None

    def register_callback(self, cb):
        self.callback = cb

    def run_callback(self, *args):
        if self.callback is not None:
            asyncio.ensure_future(self.callback(*args), loop=loop)

    def watch(self):
        pass

class Button(IO):
    def __init__(self, pin):
        super().__init__()
        self.pin = pin
        GPIO.setup(self.pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        GPIO.add_event_detect(self.pin, GPIO.BOTH, callback=self.on_event, bouncetime=30)

    def on_event(self, _):
        self.run_callback(GPIO.input(self.pin) == 1)

class Rotary(IO):
    def __init__(self, clk, dt, sw):
        super().__init__()
        self.rotary = pigpio_encoder.Rotary(clk=clk, dt=dt, sw=sw)
        self.rotary.setup_rotary(min=0, max=10, rotary_callback=self.on_event)
        
    def on_event(self, counter):
        self.run_callback(counter)

    def watch(self):
        if self.rotary.counter != self.rotary.last_counter:
            self.rotary.last_counter = self.rotary.counter
            self.rotary.rotary_callback(self.rotary.counter)
        

BUTTON1 = Button(pin=27)
ROTARY1 = Rotary(clk=17, dt=22, sw=23)

DEVICES = [BUTTON1, ROTARY1]

if __name__ == "__main__":
    while True:
        sleep(1)
