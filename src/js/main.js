import $ from "jquery";
import GoldenLayout from "golden-layout";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import * as alogicSyntax from "./alogic_syntax.js";

/* global VERSION */

$("#playground-version").html("Playground Version: " + VERSION);

const config = {
  content: [{
    type: "column",
    content: [{
      type: "row",
      height: 5,
      content: [{
        type: "stack",
        id: "inputStack",
        isClosable: false,
        content:[{
          type: "component",
          componentName: "inputArea",
          title: "top.alogic"
        }]
      }, {
        type: "stack",
        id: "outputStack",
        isClosable: false,
        content: [{
          type: "component",
          componentName: "outputArea",
          componentState: {
            text: "",
            language: "plaintext"
          },
          title: "Output"
        }]
      }],
    }, {
      type: "component",
      componentName: "consoleArea",
      title: "Console",
      isClosable: false,
      height: 2
    }]
  }]
};

const root = $(".maincontent");
const myLayout = new GoldenLayout(config, root);

// Resize layout to fit visible space
root.css({ overflow: "hidden" });
window.addEventListener("resize", function () { myLayout.updateSize() });

monaco.languages.register({ id: "alogic" });

monaco.languages.setMonarchTokensProvider("alogic", alogicSyntax.monarchDefinition)

myLayout.registerComponent("inputArea", function (container, ) {
  container.editor = monaco.editor.create(container.getElement()[0], {
    value: [
      "fsm example {",
      "  in  u8 a;",
      "  in  u8 b;",
      "  out u8 s;",
      "",
      "  void main() {",
      "   s = a + b;",
      "   fence;",
      "  }",
      "}"
    ].join("\n"),
    language: "alogic",
    automaticLayout: true,
    wordWrap: false,
    rulers: [80]
  });
});

myLayout.registerComponent("outputArea", function (container, state) {
  monaco.editor.create(container.getElement()[0], {
    value: state.text,
    language: state.language,
    automaticLayout: true,
    wordWrap: false,
    readOnly: true,
    rulers: [80]
  });
});

myLayout.registerComponent("consoleArea", function (container, ) {
  window.consoleEditor = monaco.editor.create(container.getElement()[0], {
    language: "plaintext",
    automaticLayout: true,
    wordWrap: false,
    readOnly: true,
    renderIndentGuides: false
  });
});

const compileButton = $("#compileButton");
const cliArgs = $("#cliArgs");
cliArgs.val("-o out top.alogic");

function isVerilog(name) {
  return name.endsWith(".v") || name.endsWith(".sv");
}

function busyOverlayOn(text) {
  $("#busyText").html(text);
  $("div.busySpanner").addClass("show");
  $("div.busyOverlay").addClass("show");
}

function busyOverlayOff() {
  $("div.busySpanner").removeClass("show");
  $("div.busyOverlay").removeClass("show");
}

compileButton.click(function () {
  // Show overlay busy indicator
  busyOverlayOn("Compiling Alogic")

  // Gather input files
  const inputStack = myLayout.root.getItemsById("inputStack")[0];
  const files = {};
  inputStack.contentItems.forEach(item =>
    files[item.config.title] = item.container.editor.getValue()
  );

  // Create compiler request
  const request = {
    request: "compile",
    args : cliArgs.val().split(/[ ]+/),
    files : files
  }

  // Send it off
  $.ajax({
    type: "POST",
    //url: "http://localhost:8080",
    url: "https://us-central1-ccx-eng-cam.cloudfunctions.net/alogic-playground",
    data: JSON.stringify(request),
    datatype: "json",
    contentType: "application/json; charset=utf-8",
    success: function (data) {
      //console.log(request);
      //console.log(data);
      // Emit messages to the console
      const messages = data.messages.map(_ => _.text).join("\n");
      window.consoleEditor.setValue(messages);

      // Remove all current output tabs
      const outputStack = myLayout.root.getItemsById("outputStack")[0];
      while (outputStack.contentItems.length > 0) {
        outputStack.removeChild(outputStack.contentItems[0]);
      }
      // Sort output files by name, Verilog first
      const names = Object.keys(data.files).sort(function (a, b) {
        const aIsVerilog = isVerilog(a);
        const bIsVerilog = isVerilog(b);
        if (aIsVerilog && !bIsVerilog) {
          return -1;
        } else if (!aIsVerilog && bIsVerilog) {
          return 1;
        } else {
          return a.localeCompare(b);
        }
      });
      // Create new tabs holding the output files
      names.forEach(function (name) {
        const newConfig = {
          type: "component",
          title: name,
          componentName: "outputArea",
          componentState: {
            text : data.files[name],
            language : isVerilog(name)        ? "systemverilog" :
                       name.endsWith(".json") ? "json" :
                                                "plaintext"
          }
        }
        outputStack.addChild(newConfig);
      });
      // Select the first output tab (if there are any)
      if (names.length > 0) {
        outputStack.setActiveContentItem(outputStack.contentItems[0]);
      }

      // Turn off overlay
      busyOverlayOff();
    },
    error: function (error) {
      // Log request and response on error
      console.log(request);
      console.log(error);

      // Turn off overlay
      busyOverlayOff();
    }
  })
})

myLayout.init();
