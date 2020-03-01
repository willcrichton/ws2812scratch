import React from 'react';
import './App.css';
import Blockly from 'blockly';
import JavaScript from 'blockly/javascript';
import colorString from 'color-string';

window.colorString = colorString;

const DEBUG = true;

let NUM_PIXELS;
let ROTARY = 0;
let BUTTON = false;
let _last_button = false;

let rpi;

window.KillProg = false;

Blockly.Blocks['controls_forever'] = {init: function() {
  this.jsonInit({
    message0: 'forever',
    args1: [{type: 'input_statement', name: 'body'}],
    message1: 'do %1',
    style: "loop_blocks",
    previousStatement: true
  });
}};

JavaScript['controls_forever'] = function(block) {
  return `function _forever() {
    ${JavaScript.statementToCode(block, 'body')}
    if (!window.KillProg) {
      setTimeout(_forever, 5);
    }
  }
  _forever()`;
};

Blockly.Blocks['number_to_index'] = {init: function() {
  this.jsonInit({
    message0: 'convert number %1',
    args0: [{type: 'input_value', name: 'number', check: 'Number'}],
    message1: 'to index of list length %1',
    args1: [{type: 'input_value', name: 'length', check: 'Number'}],
    output: 'Number'
  });
}};

JavaScript['number_to_index'] = function(block) {
  return [`(${JavaScript.valueToCode(block, 'number', JavaScript.ORDER_COMMA)}-1)%${JavaScript.valueToCode(block, 'length', JavaScript.ORDER_COMMA)}+1`,
          JavaScript.ORDER_NONE];
};

class Block {
  static codegen(block) {
    const arg_str = (this.config.args0 || [])
      .map((arg) => {
        let expr_str = JavaScript.valueToCode(
          block, arg.name, JavaScript.ORDER_COMMA);
        if (arg.check === 'Colour') {
          expr_str = `colorString.get.rgb(${expr_str})`;
        }
        return expr_str;
      })
      .join(',');
    const code = `await ${this.name()}.execute(${arg_str})`;
    if (this.config.output) {
      return [code, JavaScript.ORDER_NONE];
    } else {
      return `${code};\n`;
    }
  };

  static register() {
    const cls = this.name();
    const config = this.config;
    Blockly.Blocks[cls] = {init: function() { this.jsonInit(config); }};
    JavaScript[cls] = (block) => { return this.codegen(block); }
    window[cls] = this;
  }
}

// TODO: when to trigger callbacks
class CallbackBlock extends Block {
  static codegen(block) {
    return `
${this.name()}.register_callback(async function() {
  ${JavaScript.statementToCode(block, 'body')}
});
    `;
  }

  static register_callback(fn) {
    this.callbacks.push(fn);
  }
}

class LightInit extends Block {
  static config = {
    message0: 'initialize lights %1',
    args0: [{type: 'input_statement', name: 'body'}]
  }

  static name() { return 'LightInit'; }

  static codegen(block) {
    return `(async function() {
  ${JavaScript.statementToCode(block, 'body')}
})().catch(function(err) {
  window.alert("The program encountered an error. Make sure you didn't leave out any missing blocks. The specific error was: " + err.message);
})`;
  }
}

class LightSetPixel extends Block {
  static config = {
    args0: [
      {type: 'input_value',  name: 'pixel', check: 'Number'},
      {type: 'input_value',  name: 'color', check: 'Colour'}
    ],
    message0: 'set pixel %1 to color %2',
    nextStatement: true,
    previousStatement: true
  }

  static name() { return 'LightSetPixel'; }

  static async execute(pixel, color) {
    //console.log('SetPixel', pixel, color);
    rpi.send(`setpixel ${pixel-1} ${color[0]} ${color[1]} ${color[2]}`);
  }
}

class LightSetAllPixels extends Block {
  static config = {
    args0: [
      {type: 'input_value', name: 'color', check: 'Colour'}
    ],
    message0: 'set all pixels to color %1',
    nextStatement: true,
    previousStatement: true
  }

  static name() { return 'LightSetAllPixels'; }

  static async execute(color) {
    rpi.send(`setpixels ${color[0]} ${color[1]} ${color[2]}`);
  }
}

class LightGetNumberPixels extends Block {
  static config = {
    message0: 'number of pixels',
    output: 'Number'
  }

  static name() { return 'LightGetNumberPixels'; }

  static async execute() {
    return NUM_PIXELS;
  }
}

class LightGetDial extends Block {
  static config = {
    message0: 'dial value',
    output: 'Number'
  }

  static name() { return 'LightGetDial'; }

  static async execute() {
    return ROTARY;
  }
}

class LightGetButton extends Block {
  static config = {
    message0: 'is button pressed?',
    output: 'Boolean'
  }

  static name() { return 'LightGetButton'; }

  static async execute() {
    console.log('GetButton');
    return BUTTON;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

class Sleep extends Block {
  static config = {
    previousStatement: true,
    nextStatement: true,
    message0: 'sleep for %1 seconds',
    args0: [{type: 'input_value', name: 'time', check: 'Number'}]
  }

  static name() { return 'Sleep'; }

  static async execute(time) {
    await sleep(time * 1000);
  }
}


class LightOnButtonPress extends CallbackBlock {
  static callbacks = []

  static name() { return 'LightOnButtonPress'; }

  static config = {
    message0: 'When button is pressed',
    args1: [{type: 'input_statement', name: 'body'}],
    message1: '%1'
  }
}


class LightOnDialChange extends CallbackBlock {
  static callbacks = []

  static name() { return 'LightOnDialChange'; }

  static config = {
    message0: 'When dial is turned',
    args1: [{type: 'input_statement', name: 'body'}],
    message1: '%1'
  }
}

const CLASSES = [LightInit, LightSetPixel, LightSetAllPixels, LightGetNumberPixels, LightGetDial, LightGetButton, LightOnButtonPress, LightOnDialChange, Sleep];
CLASSES.forEach((cls) => cls.register());

class Coder extends React.Component {
  state = {running: false}

  constructor(props) {
    super(props);
    this.blockly = React.createRef();
    this.toolbox = React.createRef();
    this.save_link = React.createRef();
    this.load_input = React.createRef();
  }

  codeToString() {
    const xml = Blockly.Xml.workspaceToDom(this.workspace);
    const xml_text = Blockly.Xml.domToText(xml);
    return xml_text;
  }

  codeFromString(xml_text) {
    this.workspace.clear();
    const xml = Blockly.Xml.textToDom(xml_text);
    Blockly.Xml.domToWorkspace(xml, this.workspace);
  }

  componentDidMount() {
    this.workspace = Blockly.inject(this.blockly.current,
                                    {toolbox: this.toolbox.current});
    this.workspace.addChangeListener((event) => {
      localStorage.setItem('LIGHT_BLOCK_PROG', this.codeToString());
    });

    const xml_text = localStorage.getItem('LIGHT_BLOCK_PROG');
    if (xml_text) {
      this.codeFromString(xml_text);
    }

    const that = this;
    this.load_input.current.addEventListener('change', function() {
      let reader = new FileReader();
      reader.onload = function() {
        const data_bytes = new Uint8Array(this.result);
        const data_str = String.fromCharCode.apply(null, data_bytes);
        that.codeFromString(data_str);
      };

      reader.readAsArrayBuffer(this.files[0]);
    });
  }

  run() {
    JavaScript.init(this.workspace);
    const blocks = this.workspace.getTopBlocks();

    let found_init = false;
    let code = '';
    for (let block of blocks) {
      if (['LightInit', 'LightOnButtonPress', 'LightOnDialChange'].indexOf(block.type) >= 0) {
        if (block.type == 'LightInit') {
          if (found_init) {
            window.alert("You can only have one 'initialize lights' block in your workspace. Please delete the others.");
            return;
          }
          found_init = true;
        }

        code += JavaScript.blockToCode(block) + '\n';
      }
    }

    if (!found_init) {
      window.alert("You must have exactly one 'initialize lights' block, and put your program inside of it.");
      return;
    }

    code = JavaScript.finish(code);

    window.KillProg = false;

    this.setState({running: true});

    console.log(code);

    eval(code);

    this.setState({running: false});
  }

  stop() {
    window.KillProg = true;
  }

  load() {
    this.load_input.current.click();
  }

  save() {
    // https://stackoverflow.com/questions/13405129/javascript-create-and-save-file
    let file = new Blob([this.codeToString()], {type: 'text/xml'});
    let url = URL.createObjectURL(file);
    let a = this.save_link.current;
    a.href = url;
    a.download = 'program.xml';
    a.click();
    window.URL.revokeObjectURL(url);
  }

  on_select_example(file) {
    let req = new XMLHttpRequest();
    req.addEventListener('load', (resp) => {
      const xml = req.response;
      this.codeFromString(xml);
    });
    req.open('GET', file);
    req.send();
  }

  render() {
    const examples = [
      {name: "Rainbow", file: "examples/rainbow.xml"},
      {name: "Dial", file: "examples/dial.xml"},
      {name: "Button", file: "examples/button.xml"}
    ];
    return <div className='coder'>
      <div className='buttons'>
        {!this.state.running
          ? <button className='run' onClick={() => this.run()}>Run program</button>
          : <button className='stop' onClick={() => this.stop()}>Stop program</button>}
        <button onClick={() => this.save()}>Save program</button>
        <a style={{display: 'none'}} ref={this.save_link} />
        <button onClick={() => this.load()}>Load program</button>
        <select onChange={(e) => this.on_select_example(e.target.value)}>
          <option>Load an example program...</option>
          {examples.map((ex) => <option key={ex.name} value={ex.file}>{ex.name}</option>)}
        </select>
        <input style={{display: 'none'}} ref={this.load_input} type='file' />
      </div>
      <div className='blockly' ref={this.blockly} />
      <xml ref={this.toolbox} style={{display: 'none'}}>
        <category name="Control">
          <block type="controls_if"></block>
          <block type="controls_whileUntil"></block>
          <block type="controls_for"></block>
          <block type="controls_forEach"></block>
          <block type="controls_repeat_ext"></block>
          <block type="controls_forever"></block>
        </category>
        <category name="Math">
          <block type="logic_compare"></block>
          <block type="math_number"></block>
          <block type="math_arithmetic"></block>
          <block type="math_modulo"></block>
          <block type="number_to_index"></block>
        </category>
        <category name="Text">
          <block type="text"></block>
          <block type="text_print"></block>
        </category>
        <category name="Light">
          {CLASSES.map((cls) => <block type={cls.name()} />)}
        </category>
        <category name="Color">
          <block type="colour_picker"></block>
          <block type="colour_rgb"></block>
        </category>
        <category name="Lists">
          <block type="lists_create_empty"></block>
          <block type="lists_create_with"></block>
          <block type="lists_length"></block>
          <block type="lists_getIndex"></block>
          <block type="lists_setIndex"></block>
        </category>
        <category name="Variables" custom="VARIABLE"></category>
        <category name="Functions" custom="PROCEDURE"></category>
      </xml>
    </div>;
  }
}

class App extends React.Component {
  state = {loaded: false, error: false}

  constructor(props) {
    super(props);
    rpi = new WebSocket('ws://raspberrypi.local:8000');

    rpi.onclose = (event) => {
      this.setState({error: true});
    };

    rpi.addEventListener('open', () => {
      console.log('Open');
      this.setState({loaded: true});
      rpi.send('init');
    });

    rpi.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (DEBUG) {
        console.log('Received message', message);
      }
      if (message.name === 'init') {
        NUM_PIXELS = parseInt(message.value);
      } else if (message.name === 'button1') {
        BUTTON = message.value;
        if (BUTTON && !_last_button) {
          console.log(LightOnButtonPress.callbacks);
          LightOnButtonPress.callbacks.map((cb) => cb());
        }
        _last_button = BUTTON;
      } else if (message.name === 'rotary1') {
        ROTARY = message.value;
        LightOnDialChange.callbacks.map((cb) => cb());
      }
    });
  }

  render() {
    return <div className='app'>
      <h1>Light Maker</h1>
      {this.state.error
        ? <div>I wasn't able to connect to the Light Block. A few things to check:
          <ul>
            <li><strong>Power problems:</strong>
              <ul><li>Make sure the Light Block is plugged in.</li>
                <li>Open the top and make sure the Raspberry Pi has a red light turned on.</li>
              </ul></li>
            <li><strong>Network problems:</strong><br />
              To see if you have a network problem, from the terminal, run:
              <pre>ping raspberrypi.local</pre>
              If you get the response:
              <pre>ping: cannot resolve raspberrypi.local: Unknown host</pre>
       then the Raspberry Pi isn't connected to the same network as your computer.
           <ul>
             <li>Make sure your computer is on the same Wifi as the one you set up on the Pi.</li>
             <li>At this point, you will need to manually configure Wifi on the Raspberry Pi. Plug a monitor into the HDMI port and a mouse/keyboard into the USB ports. <a href="https://www.raspberrypi.org/documentation/configuration/wireless/desktop.md">Follow the directions here</a> to setup the Pi's Wifi.</li>
           </ul></li>
          </ul>
        </div>
        : (this.state.loaded
          ? <Coder />
          : <span>Waiting to connect to the Light Block...</span>)}
    </div>;
  }
}

export default App;
