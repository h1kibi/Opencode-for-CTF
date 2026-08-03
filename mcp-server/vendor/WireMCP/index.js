// index.js - WireMCP Server
const { exec } = require('child_process');
const { promisify } = require('util');
const which = require('which');
const fs = require('fs').promises;
const execAsync = promisify(exec);
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const { z } = require('zod');

const axios = {
  async get(url, options = {}) {
    const response = await fetch(url, {
      method: 'GET',
      headers: options.headers || {},
      redirect: 'follow',
    });
    return {
      status: response.status,
      data: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    };
  },
};

/*
==============================================
TLS AUTO-DECRYPTION SETUP GUIDE
==============================================

WireMCP now supports automatic TLS decryption using two methods:

1. SSL KEYLOG METHOD (Browser Traffic):
   - Set environment variable: SSLKEYLOGFILE=./keylog.txt
   - Chrome automatically writes to this file
   - Firefox: Enable in about:config
   - Use capture_tls_decrypt tool with sslKeylogFile parameter

2. PRIVATE KEY METHOD (Server Traffic):
   - Obtain server's private key (.key or .pem file)
   - Use capture_tls_decrypt or decrypt_raw_data tools
   - Specify privateKeyFile and port parameters
   - For encrypted keys, provide privateKeyPassword

Example Environment Setup:
   Windows: set SSLKEYLOGFILE=C:\path\to\keylog.txt
   Linux/Mac: export SSLKEYLOGFILE=/path/to/keylog.txt

Example Usage:
   capture_tls_decrypt({
     interface: "en0", 
     duration: 30,
     sslKeylogFile: "./keylog.txt"
   })

==============================================
*/

// Redirect console.log to stderr
const originalConsoleLog = console.log;
console.log = (...args) => console.error(...args);

// Dynamically locate tshark
async function findTshark() {
  try {
    const tsharkPath = await which('tshark');
    console.error(`Found tshark at: ${tsharkPath}`);
    return tsharkPath;
  } catch (err) {
    console.error('which failed to find tshark:', err.message);
    const fallbacks = process.platform === 'win32'
      ? ['C:\\Program Files\\Wireshark\\tshark.exe', 'C:\\Program Files (x86)\\Wireshark\\tshark.exe']
      : ['/usr/bin/tshark', '/usr/local/bin/tshark', '/opt/homebrew/bin/tshark', '/Applications/Wireshark.app/Contents/MacOS/tshark'];
    
    for (const path of fallbacks) {
      try {
        await execAsync(`"${path}" -v`);
        console.error(`Found tshark at fallback: ${path}`);
        return path;
      } catch (e) {
        console.error(`Fallback ${path} failed: ${e.message}`);
      }
    }
    throw new Error('tshark not found. Please install Wireshark (https://www.wireshark.org/download.html) and ensure tshark is in your PATH.');
  }
}

// Initialize MCP server
const server = new McpServer({
  name: 'wiremcp',
  version: '1.0.0',
});

// Tool 1: Capture live packet data
server.tool(
  'capture_packets',
  'Capture live traffic and provide raw packet data as JSON for LLM analysis',
  {
    interface: z.string().optional().default('en0').describe('Network interface to capture from (e.g., eth0, en0)'),
    duration: z.number().optional().default(5).describe('Capture duration in seconds'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { interface, duration } = args;
      const tempPcap = 'temp_capture.pcap';
      console.error(`Capturing packets on ${interface} for ${duration}s`);

      await execAsync(
        `"${tsharkPath}" -i ${interface} -w ${tempPcap} -a duration:${duration}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      const { stdout, stderr } = await execAsync(
        `"${tsharkPath}" -r "${tempPcap}" -T json -e frame.number -e ip.src -e ip.dst -e tcp.srcport -e tcp.dstport -e tcp.flags -e frame.time -e http.request.method -e http.response.code`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );
      if (stderr) console.error(`tshark stderr: ${stderr}`);
      let packets = JSON.parse(stdout);

      const maxChars = 720000;
      let jsonString = JSON.stringify(packets);
      if (jsonString.length > maxChars) {
        const trimFactor = maxChars / jsonString.length;
        const trimCount = Math.floor(packets.length * trimFactor);
        packets = packets.slice(0, trimCount);
        jsonString = JSON.stringify(packets);
        console.error(`Trimmed packets from ${packets.length} to ${trimCount} to fit ${maxChars} chars`);
      }

      await fs.unlink(tempPcap).catch(err => console.error(`Failed to delete ${tempPcap}: ${err.message}`));

      return {
        content: [{
          type: 'text',
          text: `Captured packet data (JSON for LLM analysis):\n${jsonString}`,
        }],
      };
    } catch (error) {
      console.error(`Error in capture_packets: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 2: Capture and provide summary statistics
server.tool(
  'get_summary_stats',
  'Capture live traffic and provide protocol hierarchy statistics for LLM analysis',
  {
    interface: z.string().optional().default('en0').describe('Network interface to capture from (e.g., eth0, en0)'),
    duration: z.number().optional().default(5).describe('Capture duration in seconds'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { interface, duration } = args;
      const tempPcap = 'temp_capture.pcap';
      console.error(`Capturing summary stats on ${interface} for ${duration}s`);

      await execAsync(
        `"${tsharkPath}" -i ${interface} -w ${tempPcap} -a duration:${duration}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      const { stdout, stderr } = await execAsync(
        `"${tsharkPath}" -r "${tempPcap}" -qz io,phs`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );
      if (stderr) console.error(`tshark stderr: ${stderr}`);

      await fs.unlink(tempPcap).catch(err => console.error(`Failed to delete ${tempPcap}: ${err.message}`));

      return {
        content: [{
          type: 'text',
          text: `Protocol hierarchy statistics for LLM analysis:\n${stdout}`,
        }],
      };
    } catch (error) {
      console.error(`Error in get_summary_stats: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 3: Capture and provide conversation stats
server.tool(
  'get_conversations',
  'Capture live traffic and provide TCP/UDP conversation statistics for LLM analysis',
  {
    interface: z.string().optional().default('en0').describe('Network interface to capture from (e.g., eth0, en0)'),
    duration: z.number().optional().default(5).describe('Capture duration in seconds'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { interface, duration } = args;
      const tempPcap = 'temp_capture.pcap';
      console.error(`Capturing conversations on ${interface} for ${duration}s`);

      await execAsync(
        `"${tsharkPath}" -i ${interface} -w ${tempPcap} -a duration:${duration}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      const { stdout, stderr } = await execAsync(
        `"${tsharkPath}" -r "${tempPcap}" -qz conv,tcp`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );
      if (stderr) console.error(`tshark stderr: ${stderr}`);

      await fs.unlink(tempPcap).catch(err => console.error(`Failed to delete ${tempPcap}: ${err.message}`));

      return {
        content: [{
          type: 'text',
          text: `TCP/UDP conversation statistics for LLM analysis:\n${stdout}`,
        }],
      };
    } catch (error) {
      console.error(`Error in get_conversations: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 4: Capture traffic and check threats against URLhaus
server.tool(
  'check_threats',
  'Capture live traffic and check IPs against URLhaus blacklist',
  {
    interface: z.string().optional().default('en0').describe('Network interface to capture from (e.g., eth0, en0)'),
    duration: z.number().optional().default(5).describe('Capture duration in seconds'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { interface, duration } = args;
      const tempPcap = 'temp_capture.pcap';
      console.error(`Capturing traffic on ${interface} for ${duration}s to check threats`);

      await execAsync(
        `"${tsharkPath}" -i ${interface} -w ${tempPcap} -a duration:${duration}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      const { stdout } = await execAsync(
        `"${tsharkPath}" -r "${tempPcap}" -T fields -e ip.src -e ip.dst`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );
      const ips = [...new Set(stdout.split('\n').flatMap(line => line.split('\t')).filter(ip => ip && ip !== 'unknown'))];
      console.error(`Captured ${ips.length} unique IPs: ${ips.join(', ')}`);

      const urlhausUrl = 'https://urlhaus.abuse.ch/downloads/text/';
      console.error(`Fetching URLhaus blacklist from ${urlhausUrl}`);
      let urlhausData;
      let urlhausThreats = [];
      try {
        const response = await axios.get(urlhausUrl);
        console.error(`URLhaus response status: ${response.status}, length: ${response.data.length} chars`);
        console.error(`URLhaus raw data (first 200 chars): ${response.data.slice(0, 200)}`);
        const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
        urlhausData = [...new Set(response.data.split('\n')
          .map(line => {
            const match = line.match(ipRegex);
            return match ? match[0] : null;
          })
          .filter(ip => ip))];
        console.error(`URLhaus lookup successful: ${urlhausData.length} blacklist IPs fetched`);
        console.error(`Sample URLhaus IPs: ${urlhausData.slice(0, 5).join(', ') || 'None'}`);
        urlhausThreats = ips.filter(ip => urlhausData.includes(ip));
        console.error(`Checked IPs against URLhaus: ${urlhausThreats.length} threats found - ${urlhausThreats.join(', ') || 'None'}`);
      } catch (e) {
        console.error(`Failed to fetch URLhaus data: ${e.message}`);
        urlhausData = [];
      }

      const outputText = `Captured IPs:\n${ips.join('\n')}\n\n` +
        `Threat check against URLhaus blacklist:\n${
          urlhausThreats.length > 0 ? `Potential threats: ${urlhausThreats.join(', ')}` : 'No threats detected in URLhaus blacklist.'
        }`;

      await fs.unlink(tempPcap).catch(err => console.error(`Failed to delete ${tempPcap}: ${err.message}`));

      return {
        content: [{ type: 'text', text: outputText }],
      };
    } catch (error) {
      console.error(`Error in check_threats: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 5: Check a specific IP against URLhaus IOCs
server.tool(
  'check_ip_threats',
  'Check a given IP address against URLhaus blacklist for IOCs',
  {
    ip: z.string().regex(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/).describe('IP address to check (e.g., 192.168.1.1)'),
  },
  async (args) => {
    try {
      const { ip } = args;
      console.error(`Checking IP ${ip} against URLhaus blacklist`);

      const urlhausUrl = 'https://urlhaus.abuse.ch/downloads/text/';
      console.error(`Fetching URLhaus blacklist from ${urlhausUrl}`);
      let urlhausData;
      let isThreat = false;
      try {
        const response = await axios.get(urlhausUrl);
        console.error(`URLhaus response status: ${response.status}, length: ${response.data.length} chars`);
        console.error(`URLhaus raw data (first 200 chars): ${response.data.slice(0, 200)}`);
        const ipRegex = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/;
        urlhausData = [...new Set(response.data.split('\n')
          .map(line => {
            const match = line.match(ipRegex);
            return match ? match[0] : null;
          })
          .filter(ip => ip))];
        console.error(`URLhaus lookup successful: ${urlhausData.length} blacklist IPs fetched`);
        console.error(`Sample URLhaus IPs: ${urlhausData.slice(0, 5).join(', ') || 'None'}`);
        isThreat = urlhausData.includes(ip);
        console.error(`IP ${ip} checked against URLhaus: ${isThreat ? 'Threat found' : 'No threat found'}`);
      } catch (e) {
        console.error(`Failed to fetch URLhaus data: ${e.message}`);
        urlhausData = [];
      }

      const outputText = `IP checked: ${ip}\n\n` +
        `Threat check against URLhaus blacklist:\n${
          isThreat ? 'Potential threat detected in URLhaus blacklist.' : 'No threat detected in URLhaus blacklist.'
        }`;

      return {
        content: [{ type: 'text', text: outputText }],
      };
    } catch (error) {
      console.error(`Error in check_ip_threats: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 6: Analyze an existing PCAP file for general context
server.tool(
  'analyze_pcap',
  'Analyze a PCAP file and provide general packet data as JSON for LLM analysis',
  {
    pcapPath: z.string().describe('Path to the PCAP file to analyze (e.g., ./demo.pcap)'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { pcapPath } = args;
      console.error(`Analyzing PCAP file: ${pcapPath}`);

      // Check if file exists
      await fs.access(pcapPath);

      // Extract broad packet data
      const { stdout, stderr } = await execAsync(
        `"${tsharkPath}" -r "${pcapPath}" -T json -e frame.number -e ip.src -e ip.dst -e tcp.srcport -e tcp.dstport -e udp.srcport -e udp.dstport -e http.host -e http.request.uri -e frame.protocols`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );
      if (stderr) console.error(`tshark stderr: ${stderr}`);
      const packets = JSON.parse(stdout);

      const ips = [...new Set(packets.flatMap(p => [
        p._source?.layers['ip.src']?.[0],
        p._source?.layers['ip.dst']?.[0]
      ]).filter(ip => ip))];
      console.error(`Found ${ips.length} unique IPs: ${ips.join(', ')}`);

      const urls = packets
        .filter(p => p._source?.layers['http.host'] && p._source?.layers['http.request.uri'])
        .map(p => `http://${p._source.layers['http.host'][0]}${p._source.layers['http.request.uri'][0]}`);
      console.error(`Found ${urls.length} URLs: ${urls.join(', ') || 'None'}`);

      const protocols = [...new Set(packets.map(p => p._source?.layers['frame.protocols']?.[0]))].filter(p => p);
      console.error(`Found protocols: ${protocols.join(', ') || 'None'}`);

      const maxChars = 720000;
      let jsonString = JSON.stringify(packets);
      if (jsonString.length > maxChars) {
        const trimFactor = maxChars / jsonString.length;
        const trimCount = Math.floor(packets.length * trimFactor);
        packets.splice(trimCount);
        jsonString = JSON.stringify(packets);
        console.error(`Trimmed packets from ${packets.length} to ${trimCount} to fit ${maxChars} chars`);
      }

      const outputText = `Analyzed PCAP: ${pcapPath}\n\n` +
        `Unique IPs:\n${ips.join('\n')}\n\n` +
        `URLs:\n${urls.length > 0 ? urls.join('\n') : 'None'}\n\n` +
        `Protocols:\n${protocols.join('\n') || 'None'}\n\n` +
        `Packet Data (JSON for LLM):\n${jsonString}`;

      return {
        content: [{ type: 'text', text: outputText }],
      };
    } catch (error) {
      console.error(`Error in analyze_pcap: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 7: Decrypt and extract raw source data from packets with TLS decryption
server.tool(
  'decrypt_raw_data',
  'Extract and decrypt raw packet data, payloads, and encrypted content from a PCAP file with TLS decryption support',
  {
    pcapPath: z.string().describe('Path to the PCAP file to analyze (e.g., ./demo.pcap)'),
    protocol: z.string().optional().default('all').describe('Protocol to focus on: tcp, udp, http, tls, all'),
    maxPackets: z.number().optional().default(50).describe('Maximum number of packets to analyze (1-200)'),
    sslKeylogFile: z.string().optional().describe('Path to SSL keylog file for TLS decryption (e.g., ./keylog.txt)'),
    privateKeyFile: z.string().optional().describe('Path to private key file for TLS decryption (e.g., ./server.key)'),
    privateKeyPassword: z.string().optional().describe('Password for encrypted private key file'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { pcapPath, protocol, maxPackets, sslKeylogFile, privateKeyFile, privateKeyPassword } = args;
      console.error(`Extracting raw data from PCAP file: ${pcapPath}, protocol: ${protocol}, max packets: ${maxPackets}`);
      
      if (sslKeylogFile) console.error(`Using SSL keylog file: ${sslKeylogFile}`);
      if (privateKeyFile) console.error(`Using private key file: ${privateKeyFile}`);

      await fs.access(pcapPath);
      
      // Build TLS decryption options
      let tlsOptions = '';
      if (sslKeylogFile) {
        await fs.access(sslKeylogFile);
        tlsOptions += ` -o "tls.keylog_file:${sslKeylogFile}"`;
      }
      if (privateKeyFile) {
        await fs.access(privateKeyFile);
        tlsOptions += ` -o "tls.keys_list:0.0.0.0,443,http,${privateKeyFile}"`;
        if (privateKeyPassword) {
          tlsOptions += ` -o "tls.keystore_password:${privateKeyPassword}"`;
        }
      }

      // Extract raw packet data with payloads
      const { stdout: rawData } = await execAsync(
        `"${tsharkPath}" -r "${pcapPath}" -T fields -e frame.number -e ip.src -e ip.dst -e tcp.srcport -e tcp.dstport -e udp.srcport -e udp.dstport -e tcp.payload -e udp.payload -e data.data -e frame.protocols -c ${maxPackets}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      // Extract TLS/SSL data if present
      const { stdout: tlsData } = await execAsync(
        `"${tsharkPath}" -r "${pcapPath}" -T fields -e frame.number -e tls.handshake.type -e tls.record.content_type -e tls.app_data -e ssl.handshake.type -e ssl.record.content_type -e ssl.app_data -c ${maxPackets}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      // Extract HTTP data with TLS decryption if keys provided
      const { stdout: httpData } = await execAsync(
        `"${tsharkPath}" -r "${pcapPath}"${tlsOptions} -T fields -e frame.number -e http.request.method -e http.request.uri -e http.host -e http.user_agent -e http.request.line -e http.response.line -e http.file_data -c ${maxPackets}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      // Extract decrypted TLS data if keys provided
      let decryptedData = '';
      if (tlsOptions) {
        try {
          const { stdout: decrypted } = await execAsync(
            `"${tsharkPath}" -r "${pcapPath}"${tlsOptions} -T fields -e frame.number -e http2.data.data -e http.request.full_uri -e http.response.phrase -e tls.app_data_proto -c ${maxPackets}`,
            { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
          );
          decryptedData = decrypted;
          console.error(`Successfully extracted decrypted TLS data`);
        } catch (e) {
          console.error(`TLS decryption failed: ${e.message}`);
        }
      }

      const packets = [];
      const rawLines = rawData.split('\n').filter(line => line.trim());
      const tlsLines = tlsData.split('\n').filter(line => line.trim());
      const httpLines = httpData.split('\n').filter(line => line.trim());

      // Process raw packet data
      rawLines.forEach((line, index) => {
        const [frameNum, srcIP, dstIP, tcpSrcPort, tcpDstPort, udpSrcPort, udpDstPort, tcpPayload, udpPayload, dataPayload, protocols] = line.split('\t');
        
        if (!frameNum) return;

        const packet = {
          frame: frameNum,
          src: srcIP || 'unknown',
          dst: dstIP || 'unknown',
          protocols: protocols || 'unknown',
          ports: '',
          payload: '',
          payloadType: 'none'
        };

        // Determine ports and payload
        if (tcpSrcPort && tcpDstPort) {
          packet.ports = `${tcpSrcPort}->${tcpDstPort}`;
          packet.payload = tcpPayload || '';
          packet.payloadType = 'tcp';
        } else if (udpSrcPort && udpDstPort) {
          packet.ports = `${udpSrcPort}->${udpDstPort}`;
          packet.payload = udpPayload || '';
          packet.payloadType = 'udp';
        } else if (dataPayload) {
          packet.payload = dataPayload;
          packet.payloadType = 'data';
        }

        // Add TLS data if available
        if (index < tlsLines.length) {
          const tlsFields = tlsLines[index].split('\t');
          if (tlsFields[1] || tlsFields[2] || tlsFields[3]) {
            packet.tls = {
              handshakeType: tlsFields[1] || '',
              contentType: tlsFields[2] || '',
              appData: tlsFields[3] || tlsFields[6] || ''
            };
          }
        }

        // Add HTTP data if available
        if (index < httpLines.length) {
          const httpFields = httpLines[index].split('\t');
          if (httpFields[1] || httpFields[2] || httpFields[7]) {
            packet.http = {
              method: httpFields[1] || '',
              uri: httpFields[2] || '',
              host: httpFields[3] || '',
              userAgent: httpFields[4] || '',
              requestLine: httpFields[5] || '',
              responseLine: httpFields[6] || '',
              fileData: httpFields[7] || ''
            };
          }
        }

        packets.push(packet);
      });

      // Filter by protocol if specified
      const filteredPackets = protocol === 'all' ? packets : 
        packets.filter(p => p.protocols.toLowerCase().includes(protocol.toLowerCase()));

      // Analyze and decode payloads
      const analyzedPackets = filteredPackets.map(packet => {
        const analysis = {
          ...packet,
          decoded: {},
          rawHex: '',
          rawAscii: ''
        };

        if (packet.payload) {
          // Convert hex to readable format
          const hexData = packet.payload.replace(/:/g, '');
          analysis.rawHex = hexData;
          
          // Convert hex to ASCII
          let ascii = '';
          for (let i = 0; i < hexData.length; i += 2) {
            const byte = parseInt(hexData.substr(i, 2), 16);
            ascii += (byte >= 32 && byte <= 126) ? String.fromCharCode(byte) : '.';
          }
          analysis.rawAscii = ascii;

          // Attempt to decode common patterns
          if (ascii.includes('HTTP/')) {
            analysis.decoded.type = 'HTTP';
            analysis.decoded.content = ascii;
          } else if (ascii.includes('GET ') || ascii.includes('POST ')) {
            analysis.decoded.type = 'HTTP Request';
            analysis.decoded.content = ascii;
          } else if (hexData.startsWith('1603') || hexData.startsWith('1503')) {
            analysis.decoded.type = 'TLS/SSL';
            analysis.decoded.content = 'Encrypted TLS traffic detected';
          } else if (ascii.match(/[a-zA-Z0-9+/]{20,}={0,2}/)) {
            analysis.decoded.type = 'Base64';
            try {
              analysis.decoded.content = Buffer.from(ascii.match(/[a-zA-Z0-9+/]+=*/)[0], 'base64').toString();
            } catch (e) {
              analysis.decoded.content = 'Base64 decode failed';
            }
          } else if (ascii.length > 10) {
            analysis.decoded.type = 'Text/Binary';
            analysis.decoded.content = ascii.substring(0, 200);
          }
        }

        return analysis;
      });

      console.error(`Analyzed ${analyzedPackets.length} packets with raw data`);

      const outputText = `Raw Data Analysis: ${pcapPath}\n` +
        `Protocol Filter: ${protocol}\n` +
        `Packets Analyzed: ${analyzedPackets.length}\n\n` +
        `PACKET DETAILS:\n` +
        `================\n\n` +
        analyzedPackets.map(p => {
          let output = `Frame ${p.frame}: ${p.src} -> ${p.dst}`;
          if (p.ports) output += ` [${p.ports}]`;
          output += `\nProtocols: ${p.protocols}\n`;
          
          if (p.http && (p.http.method || p.http.fileData)) {
            output += `HTTP: ${p.http.method || 'Response'} ${p.http.uri || ''}\n`;
            if (p.http.host) output += `Host: ${p.http.host}\n`;
            if (p.http.fileData) output += `File Data: ${p.http.fileData.substring(0, 100)}...\n`;
          }
          
          if (p.tls && p.tls.appData) {
            output += `TLS App Data: ${p.tls.appData.substring(0, 50)}...\n`;
          }
          
          if (p.rawHex) {
            output += `Raw Hex (${p.rawHex.length/2} bytes): ${p.rawHex.substring(0, 64)}${p.rawHex.length > 64 ? '...' : ''}\n`;
            output += `Raw ASCII: ${p.rawAscii.substring(0, 64)}${p.rawAscii.length > 64 ? '...' : ''}\n`;
            
            if (p.decoded.type) {
              output += `Decoded as ${p.decoded.type}: ${p.decoded.content.substring(0, 100)}${p.decoded.content.length > 100 ? '...' : ''}\n`;
            }
          }
          
          return output + '\n';
        }).join('---\n') +
        `\nDECRYPTION NOTES:\n` +
        `================\n` +
        `- TLS/SSL traffic requires private keys for decryption\n` +
        `- Use Wireshark with keylog files for TLS decryption\n` +
        `- Some protocols may use custom encryption\n` +
        `- Check for credentials in plaintext protocols first`;

      return {
        content: [{ type: 'text', text: outputText }],
      };
    } catch (error) {
      console.error(`Error in decrypt_raw_data: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 8: Live capture with TLS auto-decryption
server.tool(
  'capture_tls_decrypt',
  'Capture live traffic with automatic TLS decryption using keylog or private keys',
  {
    interface: z.string().optional().default('en0').describe('Network interface to capture from (e.g., eth0, en0)'),
    duration: z.number().optional().default(10).describe('Capture duration in seconds'),
    sslKeylogFile: z.string().optional().describe('Path to SSL keylog file for TLS decryption (e.g., ./keylog.txt)'),
    privateKeyFile: z.string().optional().describe('Path to private key file for TLS decryption (e.g., ./server.key)'),
    privateKeyPassword: z.string().optional().describe('Password for encrypted private key file'),
    port: z.number().optional().default(443).describe('Port to associate with private key (default: 443)'),
  },
  async (args) => {
    try {
      const tsharkPath = await findTshark();
      const { interface, duration, sslKeylogFile, privateKeyFile, privateKeyPassword, port } = args;
      const tempPcap = 'temp_tls_capture.pcap';
      console.error(`Capturing TLS traffic on ${interface} for ${duration}s with decryption`);

      if (sslKeylogFile) console.error(`Using SSL keylog file: ${sslKeylogFile}`);
      if (privateKeyFile) console.error(`Using private key file: ${privateKeyFile} for port ${port}`);

      // Build TLS decryption options
      let tlsOptions = '';
      if (sslKeylogFile) {
        try {
          await fs.access(sslKeylogFile);
          tlsOptions += ` -o "tls.keylog_file:${sslKeylogFile}"`;
        } catch (e) {
          console.error(`SSL keylog file not accessible: ${e.message}`);
        }
      }
      if (privateKeyFile) {
        try {
          await fs.access(privateKeyFile);
          tlsOptions += ` -o "tls.keys_list:0.0.0.0,${port},http,${privateKeyFile}"`;
          if (privateKeyPassword) {
            tlsOptions += ` -o "tls.keystore_password:${privateKeyPassword}"`;
          }
        } catch (e) {
          console.error(`Private key file not accessible: ${e.message}`);
        }
      }

      // Capture packets
      await execAsync(
        `"${tsharkPath}" -i ${interface} -w ${tempPcap} -a duration:${duration}`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      // Extract decrypted HTTP traffic
      const { stdout: decryptedHttp, stderr } = await execAsync(
        `"${tsharkPath}" -r "${tempPcap}"${tlsOptions} -T fields -e frame.number -e ip.src -e ip.dst -e tcp.srcport -e tcp.dstport -e http.request.method -e http.request.full_uri -e http.host -e http.user_agent -e http.response.code -e http.response.phrase -e http.file_data`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      // Extract TLS handshake info
      const { stdout: tlsInfo } = await execAsync(
        `"${tsharkPath}" -r "${tempPcap}"${tlsOptions} -T fields -e frame.number -e tls.handshake.type -e tls.handshake.ciphersuite -e tls.handshake.server_name -e tls.app_data_proto`,
        { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
      );

      if (stderr) console.error(`tshark stderr: ${stderr}`);

      // Process decrypted HTTP data
      const httpLines = decryptedHttp.split('\n').filter(line => line.trim());
      const tlsLines = tlsInfo.split('\n').filter(line => line.trim());

      const decryptedRequests = [];
      const tlsConnections = [];

      httpLines.forEach(line => {
        const [frame, srcIP, dstIP, srcPort, dstPort, method, uri, host, userAgent, responseCode, responsePhrase, fileData] = line.split('\t');
        
        if (frame && (method || responseCode || fileData)) {
          decryptedRequests.push({
            frame,
            src: srcIP || 'unknown',
            dst: dstIP || 'unknown',
            port: `${srcPort || 'unknown'}->${dstPort || 'unknown'}`,
            method: method || '',
            uri: uri || '',
            host: host || '',
            userAgent: userAgent || '',
            responseCode: responseCode || '',
            responsePhrase: responsePhrase || '',
            fileData: fileData ? fileData.substring(0, 200) : ''
          });
        }
      });

      tlsLines.forEach(line => {
        const [frame, handshakeType, cipherSuite, serverName, appDataProto] = line.split('\t');
        
        if (frame && (handshakeType || serverName)) {
          tlsConnections.push({
            frame,
            handshakeType: handshakeType || '',
            cipherSuite: cipherSuite || '',
            serverName: serverName || '',
            appDataProto: appDataProto || ''
          });
        }
      });

      await fs.unlink(tempPcap).catch(err => console.error(`Failed to delete ${tempPcap}: ${err.message}`));

      const outputText = `TLS Decryption Results\n` +
        `Interface: ${interface}, Duration: ${duration}s\n` +
        `Decryption Keys: ${tlsOptions ? 'Provided' : 'None'}\n\n` +
        `DECRYPTED HTTP TRAFFIC:\n` +
        `=======================\n` +
        (decryptedRequests.length > 0 ? 
          decryptedRequests.map(req => 
            `Frame ${req.frame}: ${req.src}:${req.port} -> ${req.dst}\n` +
            `${req.method ? `${req.method} ${req.uri}` : `Response: ${req.responseCode} ${req.responsePhrase}`}\n` +
            `${req.host ? `Host: ${req.host}\n` : ''}` +
            `${req.userAgent ? `User-Agent: ${req.userAgent.substring(0, 50)}...\n` : ''}` +
            `${req.fileData ? `Data: ${req.fileData}...\n` : ''}`
          ).join('\n---\n') : 
          'No decrypted HTTP traffic found.\n') +
        `\nTLS HANDSHAKE INFO:\n` +
        `==================\n` +
        (tlsConnections.length > 0 ?
          tlsConnections.map(tls =>
            `Frame ${tls.frame}: ${tls.serverName || 'Unknown Server'}\n` +
            `Handshake: ${tls.handshakeType}, Cipher: ${tls.cipherSuite}\n` +
            `Protocol: ${tls.appDataProto || 'Unknown'}`
          ).join('\n---\n') :
          'No TLS handshake information found.\n') +
        `\nDECRYPTION SETUP GUIDE:\n` +
        `======================\n` +
        `1. SSL Keylog Method (Browser traffic):\n` +
        `   - Set SSLKEYLOGFILE environment variable\n` +
        `   - Use browser keylog: export SSLKEYLOGFILE=./keylog.txt\n` +
        `   - Pass keylog file to this tool\n\n` +
        `2. Private Key Method (Server traffic):\n` +
        `   - Obtain server private key (.key or .pem file)\n` +
        `   - Specify key file and port in tool parameters\n` +
        `   - For encrypted keys, provide password\n\n` +
        `3. Environment Setup:\n` +
        `   - Windows: set SSLKEYLOGFILE=C:\\path\\to\\keylog.txt\n` +
        `   - Linux/Mac: export SSLKEYLOGFILE=/path/to/keylog.txt\n` +
        `   - Chrome: Automatically writes to keylog file\n` +
        `   - Firefox: Set security.tls.insecure_fallback_hosts`;

      return {
        content: [{ type: 'text', text: outputText }],
      };
    } catch (error) {
      console.error(`Error in capture_tls_decrypt: ${error.message}`);
      return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
    }
  }
);

// Tool 9: Extract credentials from a PCAP file
server.tool(
    'extract_credentials',
    'Extract potential credentials (HTTP Basic Auth, FTP, Telnet) from a PCAP file for LLM analysis',
    {
      pcapPath: z.string().describe('Path to the PCAP file to analyze (e.g., ./demo.pcap)'),
    },
    async (args) => {
      try {
        const tsharkPath = await findTshark();
        const { pcapPath } = args;
        console.error(`Extracting credentials from PCAP file: ${pcapPath}`);
  
        await fs.access(pcapPath);
  
        // Extract plaintext credentials
        const { stdout: plaintextOut } = await execAsync(
          `"${tsharkPath}" -r "${pcapPath}" -T fields -e http.authbasic -e ftp.request.command -e ftp.request.arg -e telnet.data -e frame.number`,
          { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
        );

        // Extract Kerberos credentials
        const { stdout: kerberosOut } = await execAsync(
          `"${tsharkPath}" -r "${pcapPath}" -T fields -e kerberos.CNameString -e kerberos.realm -e kerberos.cipher -e kerberos.type -e kerberos.msg_type -e frame.number`,
          { env: { ...process.env, PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin:/opt/homebrew/bin` } }
        );

        const lines = plaintextOut.split('\n').filter(line => line.trim());
        const packets = lines.map(line => {
          const [authBasic, ftpCmd, ftpArg, telnetData, frameNumber] = line.split('\t');
          return {
            authBasic: authBasic || '',
            ftpCmd: ftpCmd || '',
            ftpArg: ftpArg || '',
            telnetData: telnetData || '',
            frameNumber: frameNumber || ''
          };
        });
  
        const credentials = {
          plaintext: [],
          encrypted: []
        };
  
        // Process HTTP Basic Auth
        packets.forEach(p => {
          if (p.authBasic) {
            const [username, password] = Buffer.from(p.authBasic, 'base64').toString().split(':');
            credentials.plaintext.push({ type: 'HTTP Basic Auth', username, password, frame: p.frameNumber });
          }
        });
  
        // Process FTP
        packets.forEach(p => {
          if (p.ftpCmd === 'USER') {
            credentials.plaintext.push({ type: 'FTP', username: p.ftpArg, password: '', frame: p.frameNumber });
          }
          if (p.ftpCmd === 'PASS') {
            const lastUser = credentials.plaintext.findLast(c => c.type === 'FTP' && !c.password);
            if (lastUser) lastUser.password = p.ftpArg;
          }
        });
  
        // Process Telnet
        packets.forEach(p => {
          if (p.telnetData) {
            const telnetStr = p.telnetData.trim();
            if (telnetStr.toLowerCase().includes('login:') || telnetStr.toLowerCase().includes('password:')) {
              credentials.plaintext.push({ type: 'Telnet Prompt', data: telnetStr, frame: p.frameNumber });
            } else if (telnetStr && !telnetStr.match(/[A-Z][a-z]+:/) && !telnetStr.includes(' ')) {
              const lastPrompt = credentials.plaintext.findLast(c => c.type === 'Telnet Prompt');
              if (lastPrompt && lastPrompt.data.toLowerCase().includes('login:')) {
                credentials.plaintext.push({ type: 'Telnet', username: telnetStr, password: '', frame: p.frameNumber });
              } else if (lastPrompt && lastPrompt.data.toLowerCase().includes('password:')) {
                const lastUser = credentials.plaintext.findLast(c => c.type === 'Telnet' && !c.password);
                if (lastUser) lastUser.password = telnetStr;
                else credentials.plaintext.push({ type: 'Telnet', username: '', password: telnetStr, frame: p.frameNumber });
              }
            }
          }
        });

        // Process Kerberos credentials
        const kerberosLines = kerberosOut.split('\n').filter(line => line.trim());
        kerberosLines.forEach(line => {
          const [cname, realm, cipher, type, msgType, frameNumber] = line.split('\t');
          
          if (cipher && type) {
            let hashFormat = '';
            // Format hash based on message type
            if (msgType === '10' || msgType === '30') { // AS-REQ or TGS-REQ
              hashFormat = '$krb5pa$23$';
              if (cname) hashFormat += `${cname}$`;
              if (realm) hashFormat += `${realm}$`;
              hashFormat += cipher;
            } else if (msgType === '11') { // AS-REP
              hashFormat = '$krb5asrep$23$';
              if (cname) hashFormat += `${cname}@`;
              if (realm) hashFormat += `${realm}$`;
              hashFormat += cipher;
            }

            if (hashFormat) {
              credentials.encrypted.push({
                type: 'Kerberos',
                hash: hashFormat,
                username: cname || 'unknown',
                realm: realm || 'unknown',
                frame: frameNumber,
                crackingMode: msgType === '11' ? 'hashcat -m 18200' : 'hashcat -m 7500'
              });
            }
          }
        });

        console.error(`Found ${credentials.plaintext.length} plaintext and ${credentials.encrypted.length} encrypted credentials`);
  
        const outputText = `Analyzed PCAP: ${pcapPath}\n\n` +
          `Plaintext Credentials:\n${credentials.plaintext.length > 0 ? 
            credentials.plaintext.map(c => 
              c.type === 'Telnet Prompt' ? 
                `${c.type}: ${c.data} (Frame ${c.frame})` : 
                `${c.type}: ${c.username}:${c.password} (Frame ${c.frame})`
            ).join('\n') : 
            'None'}\n\n` +
          `Encrypted/Hashed Credentials:\n${credentials.encrypted.length > 0 ?
            credentials.encrypted.map(c =>
              `${c.type}: User=${c.username} Realm=${c.realm} (Frame ${c.frame})\n` +
              `Hash=${c.hash}\n` +
              `Cracking Command: ${c.crackingMode}\n`
            ).join('\n') :
            'None'}\n\n` +
          `Note: Encrypted credentials can be cracked using tools like John the Ripper or hashcat.\n` +
          `For Kerberos hashes:\n` +
          `- AS-REQ/TGS-REQ: hashcat -m 7500 or john --format=krb5pa-md5\n` +
          `- AS-REP: hashcat -m 18200 or john --format=krb5asrep`;
  
        return {
          content: [{ type: 'text', text: outputText }],
        };
      } catch (error) {
        console.error(`Error in extract_credentials: ${error.message}`);
        return { content: [{ type: 'text', text: `Error: ${error.message}` }], isError: true };
      }
    }
  );

// Add prompts for each tool
server.prompt(
  'capture_packets_prompt',
  {
    interface: z.string().optional().describe('Network interface to capture from'),
    duration: z.number().optional().describe('Duration in seconds to capture'),
  },
  ({ interface = 'en0', duration = 5 }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please analyze the network traffic on interface ${interface} for ${duration} seconds and provide insights about:
1. The types of traffic observed
2. Any notable patterns or anomalies
3. Key IP addresses and ports involved
4. Potential security concerns`
      }
    }]
  })
);

server.prompt(
  'summary_stats_prompt',
  {
    interface: z.string().optional().describe('Network interface to capture from'),
    duration: z.number().optional().describe('Duration in seconds to capture'),
  },
  ({ interface = 'en0', duration = 5 }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please provide a summary of network traffic statistics from interface ${interface} over ${duration} seconds, focusing on:
1. Protocol distribution
2. Traffic volume by protocol
3. Notable patterns in protocol usage
4. Potential network health indicators`
      }
    }]
  })
);

server.prompt(
  'conversations_prompt',
  {
    interface: z.string().optional().describe('Network interface to capture from'),
    duration: z.number().optional().describe('Duration in seconds to capture'),
  },
  ({ interface = 'en0', duration = 5 }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please analyze network conversations on interface ${interface} for ${duration} seconds and identify:
1. Most active IP pairs
2. Conversation durations and data volumes
3. Unusual communication patterns
4. Potential indicators of network issues`
      }
    }]
  })
);

server.prompt(
  'check_threats_prompt',
  {
    interface: z.string().optional().describe('Network interface to capture from'),
    duration: z.number().optional().describe('Duration in seconds to capture'),
  },
  ({ interface = 'en0', duration = 5 }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please analyze traffic on interface ${interface} for ${duration} seconds and check for security threats:
1. Compare captured IPs against URLhaus blacklist
2. Identify potential malicious activity
3. Highlight any concerning patterns
4. Provide security recommendations`
      }
    }]
  })
);

server.prompt(
  'check_ip_threats_prompt',
  {
    ip: z.string().describe('IP address to check'),
  },
  ({ ip }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please analyze the following IP address (${ip}) for potential security threats:
1. Check against URLhaus blacklist
2. Evaluate the IP's reputation
3. Identify any known malicious activity
4. Provide security recommendations`
      }
    }]
  })
);

server.prompt(
  'analyze_pcap_prompt',
  {
    pcapPath: z.string().describe('Path to the PCAP file'),
  },
  ({ pcapPath }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please analyze the PCAP file at ${pcapPath} and provide insights about:
1. Overall traffic patterns
2. Unique IPs and their interactions
3. Protocols and services used
4. Notable events or anomalies
5. Potential security concerns`
      }
    }]
  })
);

server.prompt(
  'decrypt_raw_data_prompt',
  {
    pcapPath: z.string().describe('Path to the PCAP file'),
    protocol: z.string().optional().describe('Protocol to focus on'),
    maxPackets: z.number().optional().describe('Maximum number of packets to analyze'),
    sslKeylogFile: z.string().optional().describe('Path to SSL keylog file'),
    privateKeyFile: z.string().optional().describe('Path to private key file'),
  },
  ({ pcapPath, protocol = 'all', maxPackets = 50, sslKeylogFile, privateKeyFile }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please extract and decrypt raw packet data from the PCAP file at ${pcapPath} (protocol: ${protocol}, max packets: ${maxPackets}):
1. Extract raw packet payloads and convert from hex to ASCII
2. Identify and decode encrypted protocols (TLS/SSL, etc.)
3. Analyze HTTP traffic and file transfers
4. Detect Base64 encoded data and attempt decoding
5. Use TLS decryption keys if provided (keylog: ${sslKeylogFile || 'none'}, private key: ${privateKeyFile || 'none'})
6. Provide insights on data patterns and potential security issues
7. Suggest decryption methods for encrypted traffic`
      }
    }]
  })
);

server.prompt(
  'capture_tls_decrypt_prompt',
  {
    interface: z.string().optional().describe('Network interface to capture from'),
    duration: z.number().optional().describe('Duration in seconds to capture'),
    sslKeylogFile: z.string().optional().describe('Path to SSL keylog file'),
    privateKeyFile: z.string().optional().describe('Path to private key file'),
  },
  ({ interface = 'en0', duration = 10, sslKeylogFile, privateKeyFile }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please capture and decrypt TLS traffic on interface ${interface} for ${duration} seconds:
1. Capture live network traffic with TLS decryption capabilities
2. Decrypt HTTPS traffic using keylog file (${sslKeylogFile || 'not provided'}) or private keys (${privateKeyFile || 'not provided'})
3. Extract decrypted HTTP requests, responses, and file transfers
4. Analyze TLS handshakes and cipher suites used
5. Identify server names and application protocols
6. Provide security analysis of decrypted traffic
7. Guide on proper TLS decryption setup for future captures`
      }
    }]
  })
);

server.prompt(
  'extract_credentials_prompt',
  {
    pcapPath: z.string().describe('Path to the PCAP file'),
  },
  ({ pcapPath }) => ({
    messages: [{
      role: 'user',
      content: {
        type: 'text',
        text: `Please analyze the PCAP file at ${pcapPath} for potential credential exposure:
1. Look for plaintext credentials (HTTP Basic Auth, FTP, Telnet)
2. Identify Kerberos authentication attempts
3. Extract any hashed credentials
4. Provide security recommendations for credential handling`
      }
    }]
  })
);

// Start the server
server.connect(new StdioServerTransport())
  .then(() => console.error('WireMCP Server is running...'))
  .catch(err => {
    console.error('Failed to start WireMCP:', err);
    process.exit(1);
  });
