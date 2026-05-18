# Tutorial: Build de APK (React Native / Expo) no Google Colab

Sim, **é totalmente possível** fazer o build de um APK no Google Colab! O Colab é uma máquina virtual Ubuntu na nuvem, o que permite instalar o Java, o Android SDK e executar o Gradle sem problemas. 

A sua lógica e os scripts estão corretos. O Colab já vem com várias dependências úteis (como Node.js, Python, Git) instaladas, o que facilita ainda mais o processo.

Abaixo, detalho como organizar essas etapas e também adiciono o passo do `prebuild` (caso você não envie a pasta `android` para o GitHub) e o script para baixar o APK pronto para o seu computador.

---

## Ponto de Atenção para Projetos Expo
Em projetos Expo modernos (Managed Workflow), normalmente ignoramos a pasta `android` no `.gitignore`. Quando você clona o projeto no Colab, essa pasta nativa não existirá.
Para gerá-la no Colab antes do build, basta executar `npx expo prebuild --platform android` após instalar as dependências com `npm install`.

---

## O Projeto precisa de Assinatura (Keys)?
**Sim!** O sistema operacional Android exige, por segurança, que **todo** arquivo `.apk` esteja assinado digitalmente para poder ser instalado em um celular. Não existe APK sem assinatura funcional.

Mas você não precisa se preocupar em criar ou subir chaves privadas se o seu objetivo for apenas gerar um **build de teste/preview** (equivalente ao `eas build --profile preview`):

1. **Build de Debug (`assembleDebug`):** O próprio Gradle gera uma chave temporária padrão (`debug.keystore`) em segundos no Colab e assina o APK automaticamente. O APK gerado funciona perfeitamente para instalação e testes, mas inclui ferramentas de desenvolvedor e não é otimizado em tamanho.
2. **Build de Release/Preview (`assembleRelease` com chave gerada na hora):** Se você quer um APK de alta performance, super leve, idêntico ao de produção para distribuir para testes, nós podemos **gerar uma Keystore temporária no próprio Colab** via linha de comando e usá-la no build!

---

## Passo a Passo no Colab

### 1. Preparação do Ambiente Android (SDK e Java)
Em uma célula do Colab, você executa a instalação do SDK. O seu script funciona perfeitamente para preparar o terreno.

```bash
%%bash
# 1. Atualizar pacotes e instalar o Java 17 e unzip
apt-get update -qq && apt-get install -y openjdk-17-jdk wget unzip -qq > /dev/null

# 2. Criar diretório para o SDK
export ANDROID_HOME=/opt/android-sdk
mkdir -p $ANDROID_HOME/cmdline-tools

# 3. Baixar o Android Command Line Tools
wget -q https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip -O android_tools.zip

# 4. Descompactar e ajustar a estrutura de pastas
unzip -q android_tools.zip -d $ANDROID_HOME/cmdline-tools
mv $ANDROID_HOME/cmdline-tools/cmdline-tools $ANDROID_HOME/cmdline-tools/latest
rm android_tools.zip

# 5. Exportar variáveis de ambiente
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

# 6. Aceitar as licenças do SDK
yes | sdkmanager --licenses > /dev/null

# 7. Instalar as plataformas e build-tools
sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null
echo "Android SDK configurado com sucesso!"
```

### 2. Clonar o Repositório e Preparar as Dependências
Agora você traz o código para a máquina do Colab e instala os pacotes Node.js.

```bash
%%bash
# Clone seu projeto
# Substitua a URL abaixo pela URL do seu repositório
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git /content/meu_projeto
cd /content/meu_projeto

# Instalar pacotes NPM
npm install

# (Apenas se não tiver a pasta android) Gerar a pasta nativa
npx expo prebuild --platform android
```

### 3. Fazer o Build do APK

Você tem duas opções de build abaixo:

#### Opção A: APK de Debug (Desenvolvimento)
Rápido de compilar, assinado automaticamente.

```bash
%%bash
# Declarar novamente as variáveis pois cada célula %%bash do Colab roda em uma subshell independente
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

cd /content/meu_projeto/android

# Dar permissão e executar o build de debug
chmod +x gradlew
./gradlew assembleDebug
```

#### Opção B: APK de Release/Preview (Otimizado - Recomendado)
Gera uma keystore temporária na hora no próprio Colab e faz um build idêntico ao de produção, super rápido e leve.

```bash
%%bash
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64

cd /content/meu_projeto/android

# 1. Gerar uma chave temporária de assinatura
keytool -genkey -v -keystore temp.keystore -alias temp-key-alias -keyalg RSA -keysize 2048 -validity 10000 -storepass 123456 -keypass 123456 -dname "CN=ColabTest, OU=Development, O=Test, L=Colab, S=SP, C=BR" -noprompt

# 2. Dar permissão
chmod +x gradlew

# 3. Compilar em modo Release injetando a chave temporária
./gradlew assembleRelease \
  -Pandroid.injected.signing.store.file=temp.keystore \
  -Pandroid.injected.signing.store.password=123456 \
  -Pandroid.injected.signing.key.alias=temp-key-alias \
  -Pandroid.injected.signing.key.password=123456
```

---

### 4. Baixar o APK para a sua Máquina
Suba uma célula de Python para baixar o arquivo compilado dependendo de qual opção você escolheu acima.

```python
from google.colab import files
import os

# Caminho para o APK de Debug (se escolheu Opção A)
apk_debug = "/content/meu_projeto/android/app/build/outputs/apk/debug/app-debug.apk"

# Caminho para o APK de Release (se escolheu Opção B)
apk_release = "/content/meu_projeto/android/app/build/outputs/apk/release/app-release.apk"

if os.path.exists(apk_release):
    print("Baixando o APK de Release...")
    files.download(apk_release)
elif os.path.exists(apk_debug):
    print("Baixando o APK de Debug...")
    files.download(apk_debug)
else:
    print("APK não encontrado. Verifique os logs de erro acima.")
```

---

## Dicas Extras
* **Sessão do Colab**: O Colab limpa a máquina toda vez que você se desconecta. Se você for testar builds frequentemente, pode ser interessante salvar a pasta `/opt/android-sdk` no seu Google Drive integrado ao Colab (`/content/drive/MyDrive`) e criar links simbólicos na próxima inicialização para não ter que baixar tudo novamente.
* **Segurança do Keystore temporário**: O método de criar uma keystore na hora no Colab é excelente para **testes e distribuição interna (preview)**. Porém, se você for publicar a aplicação na **Google Play Store**, não use chaves geradas na hora, pois a Play Store exige que você sempre use a mesma assinatura (se perder a chave original, nunca mais conseguirá atualizar o app). Para a loja, crie uma Keystore definitiva e guarde-a com segurança.
