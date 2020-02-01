import React from 'react';
import logo from './logo.svg';
import './App.css';
import Blockly from 'blockly';
import JavaScript from 'blockly/javascript';
import colorString from 'color-string';

window.colorString = colorString;

const DEBUG = true;
const rpi = new WebSocket('ws://10.24.7.84:8000');

let NUM_PIXELS;
let ROTARY = 0;
let BUTTON = false;

rpi.addEventListener('open', () => {
  console.log('Socket opened');
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
    LightOnButtonPress.callbacks.map((cb) => cb());
  } else if (message.name === 'rotary1') {
    ROTARY = message.value;
    LightOnDialChange.callbacks.map((cb) => cb());
  }
});

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
    const code = `${this.name}.execute(${arg_str})`;
    if (this.config.output) {
      return [code, JavaScript.ORDER_NONE];
    } else {
      return `${code};\n`;
    }
  };

  static register() {
    const cls = this.name;
    const config = this.config;
    Blockly.Blocks[cls] = {init: function() { this.jsonInit(config); }};
    JavaScript[cls] = (block) => { return this.codegen(block); }
    window.cls = this;
  }
}

// TODO: when to trigger callbacks
class CallbackBlock extends Block {
  static codegen(block) {
    return `
${this.name}.register_callback(function() {
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
    message0: 'initialize lights',
    nextStatement: true
  }

  static execute() {
    console.log('initialize lights');
    rpi.send('init');
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

  static execute(pixel, color) {
    console.log('SetPixel', pixel, color);
    rpi.send(`setpixel ${pixel} ${color[0]} ${color[1]} ${color[2]}`);
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

  static execute(color) {
    console.log('SetAllPixels', color);
    rpi.send(`setpixels ${color[0]} ${color[1]} ${color[2]}`);
  }
}

class LightGetNumberPixels extends Block {
  static config = {
    message0: 'number of pixels',
    output: 'Number'
  }

  static execute() {
    console.log('GetNumberPixels');
    return NUM_PIXELS;
  }
}

class LightGetDial extends Block {
  static config = {
    message0: 'dial value',
    output: 'Number'
  }

  static execute() {
    console.log('GetDial');
    return DIAL;
  }
}

class LightGetButton extends Block {
  static config = {
    message0: 'is button pressed?',
    output: 'Boolean'
  }

  static execute() {
    console.log('GetButton');
    return BUTTON;
  }
}

class LightOnButtonPress extends CallbackBlock {
  static callbacks = []

  static config = {
    message0: 'When button is pressed',
    args1: [{type: 'input_statement', name: 'body'}],
    message1: '%1'
  }
}


class LightOnDialChange extends CallbackBlock {
  static callbacks = []

  static config = {
    message0: 'When dial is turned',
    args1: [{type: 'input_statement', name: 'body'}],
    message1: '%1'
  }
}

const CLASSES = [LightInit, LightSetPixel, LightSetAllPixels, LightGetNumberPixels, LightGetDial, LightGetButton, LightOnButtonPress, LightOnDialChange];
CLASSES.forEach((cls) => cls.register());

class App extends React.Component {
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
    const code = JavaScript.workspaceToCode(this.workspace);
    console.log(code);
    try {
      eval(code);
    } catch (e) {
      window.alert(`Failed with error:\n${e.stack}`);
    }
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


  render() {
    return <div className='app'>
      <h1>Johnny's Light Maker</h1>
      <div className='buttons'>
        <button className='run' onClick={() => this.run()}>Run program</button>
        <button onClick={() => this.save()}>Save program</button>
        <a style={{display: 'none'}} ref={this.save_link} />
        <button onClick={() => this.load()}>Load program</button>
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
        </category>
        <category name="Math">
          <block type="logic_compare"></block>
          <block type="math_number"></block>
          <block type="math_arithmetic"></block>
          <block type="math_modulo"></block>
        </category>
        <category name="Text">
          <block type="text"></block>
          <block type="text_print"></block>
        </category>
        <category name="Light">
          {CLASSES.map((cls) => <block type={cls.name} />)}
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

export default App;
