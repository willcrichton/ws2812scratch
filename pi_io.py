from RPi import GPIO
from time import sleep

GPIO.setmode(GPIO.BCM)

class Button:
    def __init__(self, pin):
        self.pin = pin
        self.pressed = False
        self.callback = None

        GPIO.setup(self.pin, GPIO.IN, pull_up_down=GPIO.PUD_DOWN)
        GPIO.add_event_detect(self.pin, GPIO.BOTH, callback=self.on_event, bouncetime=30)

    def on_event(self, _):
        self.pressed = GPIO.input(self.pin) == 1
        if self.callback is not None:
            self.callback(self.pressed)

    def register_callback(self, cb):
        self.callback = cb

BUTTON1 = Button(pin=27)

if __name__ == "__main__":
    while True:
        sleep(1)
