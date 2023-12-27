import puppeteer from "puppeteer-extra";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import path from "node:path";
import he from "he";

async function executa668(cpf, dataNascimento) {
  return new Promise(async (resolve, reject) => {
    const browser = await puppeteer.launch({
      headless: false,
    });

    try {
      //Cria os diretorios e caminhos
      const caminhoDiretorio = path.resolve("./pdf");
      createIfNotExists(caminhoDiretorio);
      const nomeArquivo = `${cpf}-${uuidv4()}.pdf`;
      const caminhoArquivo = `${caminhoDiretorio}\\${nomeArquivo}`;

      const anoAtual = new Date().getFullYear();
      const anos = Array.from({ length: 10 }, (_, index) => anoAtual - index);
      console.log(anos);

      for (let i = 0; i < anos.length; i++) {
        let ano = anos[i];

        let tentativas = 0;
        const maxTentativas = 3; // Defina o número máximo de tentativas desejado

        while (tentativas < maxTentativas) {
          try {
            console.log("GERANDO O TOKEN");
            const tokenPromise = geraToken();
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Timeout")), 15000)
            );
            const [token] = await Promise.all([tokenPromise, timeoutPromise]);

            console.log("ENVIANDO A REQUISIÇÃO");
            const requisicao = await enviaRequisicao(
              token,
              cpf,
              ano,
              dataNascimento
            );

            const situacaoDecodificada = he.decode(requisicao.situacao);
            requisicao.situacao = situacaoDecodificada;

            const retornoJSON = JSON.stringify(requisicao, null, 2);
            console.log(retornoJSON);

            // Se chegou até aqui sem erros, sai do loop
            break;
          } catch (error) {
            // Tratamento de erro aqui
            console.error(`Erro na iteração para o ano ${ano}:`, error);
            tentativas++;
          }
        }
      }

      // for (let i = 0; i < anos.length; i++) {
      //   let ano = anos[i];

      //   console.log("GERANDO O TOKEN");
      //   const token = await geraToken();
      //   console.log("ENVIANDO A REQUISIÇÃO");
      //   const requisicao = await enviaRequisicao(
      //     token,
      //     cpf,
      //     ano,
      //     dataNascimento
      //   );

      //   const situacaoDecodificada = he.decode(requisicao.situacao);
      //   requisicao.situacao = situacaoDecodificada;

      //   const retornoJSON = JSON.stringify(requisicao, null, 2);
      //   console.log(retornoJSON);
      // }

      let pessoaFisica = requisicao.nomeContribuinte;
      let situacaoTexto = requisicao.situacao;

      const newPage = await browser.newPage();
      await newPage.setContent(
        htmlpdf(cpf, pessoaFisica, situacaoTexto, numeracao, anoPesquisa)
      );
      await newPage.emulateMediaType("screen");

      await newPage.pdf({
        path: caminhoArquivo,
        format: "A4",
        printBackground: true,
      });

      const anoNascimento = dataNascimento.replace(/^(\d{4}).*$/, "$1");
      const dataAtual = new Date();
      const ano = dataAtual.getFullYear();
      const idade = ano - anoNascimento;

      if (
        situacaoTexto.indexOf("não consta na base de dados") !== -1 ||
        idade >= 26
      ) {
        situacao = 0;
      } else {
        situacao = 1;
      }

      const base64 = readFileToBase64(caminhoArquivo);
      await browser.close();
      const dataISO = dataAtual.toISOString();

      resolve({
        Status: 200,
        DateTime: dataISO,
        HasErrors: false,
        Data: {
          Detalhamento: null,
          Pdf: base64,
        },
        Situation: situacao,
        Processing: false,
        Expiracy: null,
      });
    } catch (error) {
      console.log(error);
      await browser.close();
      reject("ocorreu um erro");
    }
  });
}

// Gera o token
async function geraToken() {
  const trabalho = await enviaTrabalho();
  const retorno = trabalho.taskId;
  let ready = false;
  let contador = 1;
  let token;
  while (!ready) {
    await sleep(5000);
    const resposta = await pegaTrabalho(retorno);
    if (resposta.status === "ready") {
      ready = true;
      token = resposta.solution.gRecaptchaResponse;
    }
    contador++;
  }
  return token;
}

// Resolve o captcha
async function pegaTrabalho(taskId) {
  const url = "https://api.capsolver.com/getTaskResult";
  const payload = {
    clientKey: "CAP-FB659BD4776E7F6E6865859553EEEDD9",
    taskId,
  };
  const resposta = await axios.post(url, payload);
  return resposta.data;
}

async function enviaTrabalho() {
  const url = "https://api.capsolver.com/createTask";
  const payload = {
    clientKey: "CAP-FB659BD4776E7F6E6865859553EEEDD9",
    task: {
      type: "HCaptchaTask",
      websiteURL: "https://www.restituicao.receita.fazenda.gov.br/#/",
      websiteKey: "1e7b8462-5e38-4418-9998-74210d909134",
      proxy: "http:pr.oxylabs.io:7777:customer-jpmorais-cc-br:Ibracem2023",
    },
  };
  const resposta = await axios.post(url, payload);
  return resposta.data;
}

async function enviaRequisicao(token, cpf, ano, dataNascimento) {
  const url = `https://www.restituicao.receita.fazenda.gov.br/servicos-rfb-apprfb-restituicao/apprfb-restituicao/consulta-restituicao/${cpf}/${ano}/${dataNascimento}`;
  const headers = {
    Host: "www.restituicao.receita.fazenda.gov.br",
    Referer: "https://www.restituicao.receita.fazenda.gov.br/",
    Aplicativo: "RESTITUICAO",
    Origem: "web",
    Servico: "consultar restituicao",
    versao_app: "1.0",
    "H-Captcha-Response": token,
  };
  const resposta = await axios.get(url, { headers: headers });
  return resposta.data;
}

async function sleep(delay) {
  return new Promise((resolve) => setTimeout(resolve, delay));
}

// Cria o diretorio caso ele não exista
function createIfNotExists(directoryName) {
  if (!fs.existsSync(directoryName)) {
    fs.mkdirSync(directoryName);
    console.log("Diretório" + directoryName + "criado com sucesso.");
  }
}

// Transforma em base64
function readFileToBase64(filePath) {
  try {
    // Lê o conteúdo do arquivo
    const fileContent = fs.readFileSync(filePath);
    // Converte o conteúdo para base64
    const base64Data = Buffer.from(fileContent).toString("base64");
    return base64Data;
  } catch (error) {
    console.error("Erro ao ler o arquivo:", error);
    throw new Error("Falha ao ler arquivo");
  }
}

// Formata data
function formatarData() {
  const meses = [
    "janeiro",
    "fevereiro",
    "março",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ];

  const dataAtual = new Date();
  const dia = dataAtual.getDate();
  const mes = meses[dataAtual.getMonth()];
  const ano = dataAtual.getFullYear();
  const hora = dataAtual.getHours();
  const minutos = dataAtual.getMinutes();

  return `${dia} de ${mes} de ${ano} às ${hora
    .toString()
    .padStart(2, "0")}:${minutos.toString().padStart(2, "0")}`;
}

// Formata o cPF
function formatarCPF(cpf) {
  cpf = cpf.replace(/\D/g, "");

  return `${cpf.substr(0, 3)}.${cpf.substr(3, 3)}.${cpf.substr(
    6,
    3
  )}-${cpf.substr(9, 2)}`;
}

// Gera o html
function htmlpdf(cpf, PessoaFisica, situacaoTexto, numeracao, anoPesquisa) {
  const imagePath = path.resolve("./azultotal.jpg");
  const imageBase64 = fs.readFileSync(imagePath, "base64");

  const conteudoHTML = `
          <!DOCTYPE html>
          <html>
            <head>
              <title>Exemplo de PDF com imagem de fundo</title>
              <style>
                body {
                  margin: 0;
                  padding: 0;
                  background-image: url('data:image/jpeg;base64,${imageBase64}');
                  background-repeat: no-repeat;
                  background-size: cover;
                  font-family: Helvetica;
                  height: 90vh;
                }
                .tab2 {
                  border: 1px #cccccc solid;
                  border-radius: 15px;
                  padding: 10px;
                  width: 100%;
                  background-color: #eeeeee;
                  font-family: Helvetica;
                  margin-top: 2rem;
                  margin-bottom: 2rem;
                }
                .tdName {
                  width: 40%;
                }
                .tdOthers {
                  width: 30%;
                }
              </style>
            </head>
            <body>
              <div style='margin-top:100px;margin-left:100px;margin-right:100px'>
                <h2 style='font-size:18px;color:RoyalBlue;font-weight:600;'>
                  Situação da Declaração de IRPF | ${numeracao}ª mais recente.
                </h2>
                <div style='border:2px solid #6666;border-radius:8px;padding:10px;padding-left:15px;'>
                  <table style='font-size:14px;font-weight:bold;border-spacing: 5px; '>
                    <tr>
                      <td style='text-align:right;background-color:#dddddd;width:100px;padding:2px;padding-right:10px;'>CPF: </td>
                      <td style='padding:2px;'>${formatarCPF(cpf)}</td>
                    </tr>
                    <tr>
                      <td style='text-align:right;background-color:#dddddd;padding:2px;padding-right:10px;'>Nome: </td>
                      <td style='padding:2px;'>${PessoaFisica}</td>
                    </tr>
                  </table>
                </div>
                <table class="tab2" style="width:100%;height:60px;font-size:14px;font-weight:500">
                  <tr>
                    <td>Pesquisa realizada por CPF</td>
                    <td>${situacaoTexto}</td>
                  </tr>
                </table>
                <div style='font-size:14px;margin-top:10px;line-height:1.3'>
                  <b>Data consulta:</b> ${formatarData()}
                </div>
                <div style='font-size:14px;margin-top:10px;line-height:1.3'>
                  <b>Fonte</b>: Receita Federal do Brasil (RFB)
                </div>
              </div>
            </body>
          </html>
        `;
  return conteudoHTML;
}

executa668("08343821726", "19801218");
