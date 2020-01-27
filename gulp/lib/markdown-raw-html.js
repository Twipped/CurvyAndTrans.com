
module.exports = exports = function (md, options) {

  options = {
    fence: '^^^',
    ...options,
  };

  const fenceLen = options.fence.length;


  md.block.ruler.before('html_block', 'raw_html', (state, startLine, endLine) => {
    const pos = state.bMarks[startLine] + state.tShift[startLine];
    const endOfLine = state.eMarks[startLine];

    const line = state.src.substring(pos, endOfLine);
    let openIndex = line.indexOf(options.fence);
    if (openIndex === -1) return;

    const preBlock = line.slice(0, openIndex);

    openIndex += pos;
    let closeIndex = state.src.indexOf(options.fence, openIndex + fenceLen);

    if (closeIndex === -1) {
      console.log(state.src.slice(pos));
      throw new Error(`Could not find terminating "${options.fence}" for a raw html block.`);
    }

    closeIndex += fenceLen;

    let nextLine = startLine;
    while (nextLine < endLine && state.eMarks[nextLine] <= closeIndex) {
      nextLine++;
    }

    if (nextLine === startLine) nextLine++;

    const postBlock = state.src.substring(closeIndex, state.eMarks[nextLine]);

    const content = state.src.substring(openIndex + fenceLen, closeIndex - fenceLen);

    // console.log({ preBlock, content, postBlock });

    const hasPre = !!preBlock.trim();
    const hasPost = !!postBlock.trim();

    let token;
    const tokenDebug = [];
    if (hasPre || hasPost) {
      token          = state.push('paragraph_open', 'p', 1);
      token.map      = [ startLine, state.line ];
      tokenDebug.push(token);

      if (hasPre) {
        token          = state.push('inline', '', 0);
        token.content  = preBlock;
        token.map      = [ startLine, startLine ];
        token.children = [];
        tokenDebug.push(token);
      }
    }

    if (content.trim()) {
      token = state.push('html_block', '', 0);
      token.map     = [ startLine, nextLine ];
      token.content = content;
      token.block = true;
      tokenDebug.push(token);
    }

    if (hasPre || hasPost) {

      if (hasPost) {
        token          = state.push('inline', '', 0);
        token.content  = postBlock;
        token.map      = [ nextLine, nextLine ];
        token.children = [];
        tokenDebug.push(token);
      }

      token = state.push('paragraph_close', 'p', -1);
      tokenDebug.push(token);
    }

    // console.log(tokenDebug);

    state.line = nextLine;
    return true;
  });


  // md.inline.ruler.before('backticks', 'raw_html', (state) => {
  //   const { pos, posMax: max, src } = state;

  //   if (src.charCodeAt(pos) !== fenceFirst || pos + fenceLen > max) return false;
  //   if (src.slice(pos, fenceLen) !== options.fence) return false;

  //   let html;
  //   let closeIndex = state.src.indexOf(options.close, fenceLen);
  //   if (closeIndex === -1) {
  //     closeIndex = state.src.length;
  //     html = state.src.substring(pos + fenceLen);
  //   } else {
  //     html = state.src.substring(pos + fenceLen, closeIndex);
  //     closeIndex += fenceLen;
  //   }

  //   const token = state.push('html_inline', '', 0);
  //   token.content = html;
  //   token.markup = options.fence;

  //   console.log(token, pos, src, state);

  //   state.pos = closeIndex;
  //   return true;
  // });
};

