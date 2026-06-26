import 'dotenv/config';
import express from 'express';
import mongoose from 'mongoose';
import morgan from 'morgan';
import cors from 'cors';

const app = express();

app.use(express.json());

app.use(cors({
  origin: 'http://localhost:4200',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(morgan('dev'));

// Modelo Evento
const eventoSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: true,
      trim: true,
      minlength: 3
    },
    descricao: {
      type: String,
      required: true,
      trim: true
    },
    dataHora: {
      type: Date,
      required: true
    },
    local: {
      type: String,
      required: true,
      trim: true
    },
    categoria: {
      type: String,
      required: true,
      trim: true
    },
    vagas: {
      type: Number,
      required: true,
      min: 1
    },
    imagem: {
      type: String,
      default: ''
    },
    organizador: {
      type: String,
      required: true,
      trim: true
    },
    inscritos: {
      type: [String],
      default: []
    }
  },
  {
    collection: 'eventos',
    timestamps: true
  }
);

const Evento = mongoose.model('Evento', eventoSchema, 'eventos');

// Calcula status do evento
function calcularStatus(dataHora) {
  const agora = new Date();
  const dataEvento = new Date(dataHora);

  if (dataEvento > agora) {
    return 'futuro';
  }

  const duasHorasDepois = new Date(dataEvento.getTime() + 2 * 60 * 60 * 1000);

  if (agora >= dataEvento && agora <= duasHorasDepois) {
    return 'ocorrendo';
  }

  return 'finalizado';
}

// Formata evento retornado para o front-end
function formatarEvento(evento) {
  const obj = evento.toObject();

  return {
    ...obj,
    status: calcularStatus(obj.dataHora),
    vagasDisponiveis: obj.vagas - obj.inscritos.length,
    totalInscritos: obj.inscritos.length
  };
}

// Rota inicial
app.get('/', (req, res) => {
  res.json({
    msg: 'API AcadEventos rodando'
  });
});

// Listar eventos com filtros
app.get('/eventos', async (req, res) => {
  try {
    const { texto, categoria, ordenar, organizador } = req.query;

    const filtro = {};

    if (texto) {
      filtro.$or = [
        { titulo: { $regex: texto, $options: 'i' } },
        { descricao: { $regex: texto, $options: 'i' } },
        { local: { $regex: texto, $options: 'i' } },
        { categoria: { $regex: texto, $options: 'i' } }
      ];
    }

    if (categoria) {
      filtro.categoria = { $regex: categoria, $options: 'i' };
    }

    if (organizador) {
      filtro.organizador = { $regex: organizador, $options: 'i' };
    }

    let ordenacao = { dataHora: 1 };

    if (ordenar === 'desc') {
      ordenacao = { dataHora: -1 };
    }

    const eventos = await Evento.find(filtro).sort(ordenacao);

    res.json(eventos.map(formatarEvento));
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Buscar evento pelo ID
app.get('/eventos/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID inválido'
      });
    }

    const evento = await Evento.findById(req.params.id);

    if (!evento) {
      return res.status(404).json({
        error: 'Evento não encontrado'
      });
    }

    res.json(formatarEvento(evento));
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Criar evento
app.post('/eventos', async (req, res) => {
  try {
    const evento = await Evento.create(req.body);

    res.status(201).json(formatarEvento(evento));
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
});

// Editar evento
app.put('/eventos/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID inválido'
      });
    }

    const eventoAtual = await Evento.findById(req.params.id);

    if (!eventoAtual) {
      return res.status(404).json({
        error: 'Evento não encontrado'
      });
    }

    if (new Date(eventoAtual.dataHora) < new Date()) {
      return res.status(400).json({
        error: 'Não é permitido editar evento que já ocorreu ou já iniciou.'
      });
    }

    const evento = await Evento.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        new: true,
        runValidators: true
      }
    );

    res.json(formatarEvento(evento));
  } catch (err) {
    res.status(400).json({
      error: err.message
    });
  }
});

// Excluir evento
app.delete('/eventos/:id', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID inválido'
      });
    }

    const evento = await Evento.findById(req.params.id);

    if (!evento) {
      return res.status(404).json({
        error: 'Evento não encontrado'
      });
    }

    if (new Date(evento.dataHora) < new Date()) {
      return res.status(400).json({
        error: 'Não é permitido excluir evento que já ocorreu ou já iniciou.'
      });
    }

    await Evento.findByIdAndDelete(req.params.id);

    res.json({
      ok: true,
      msg: 'Evento excluído com sucesso'
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Inscrever participante em evento
app.post('/eventos/:id/inscrever', async (req, res) => {
  try {
    const { participante } = req.body;

    if (!participante) {
      return res.status(400).json({
        error: 'Informe o nome ou email do participante.'
      });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID inválido'
      });
    }

    const evento = await Evento.findById(req.params.id);

    if (!evento) {
      return res.status(404).json({
        error: 'Evento não encontrado'
      });
    }

    if (new Date(evento.dataHora) < new Date()) {
      return res.status(400).json({
        error: 'Não é possível se inscrever em evento que já ocorreu.'
      });
    }

    if (evento.inscritos.includes(participante)) {
      return res.status(400).json({
        error: 'Participante já inscrito neste evento.'
      });
    }

    if (evento.inscritos.length >= evento.vagas) {
      return res.status(400).json({
        error: 'Evento sem vagas disponíveis.'
      });
    }

    evento.inscritos.push(participante);
    await evento.save();

    res.json(formatarEvento(evento));
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Cancelar inscrição
app.post('/eventos/:id/cancelar-inscricao', async (req, res) => {
  try {
    const { participante } = req.body;

    if (!participante) {
      return res.status(400).json({
        error: 'Informe o nome ou email do participante.'
      });
    }

    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID inválido'
      });
    }

    const evento = await Evento.findById(req.params.id);

    if (!evento) {
      return res.status(404).json({
        error: 'Evento não encontrado'
      });
    }

    if (!evento.inscritos.includes(participante)) {
      return res.status(400).json({
        error: 'Participante não está inscrito neste evento.'
      });
    }

    evento.inscritos = evento.inscritos.filter(
      inscrito => inscrito !== participante
    );

    await evento.save();

    res.json(formatarEvento(evento));
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Ver minhas inscrições
app.get('/inscricoes/:participante', async (req, res) => {
  try {
    const participante = req.params.participante;

    const eventos = await Evento.find({
      inscritos: participante
    }).sort({ dataHora: 1 });

    res.json(eventos.map(formatarEvento));
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Ver inscritos por evento
app.get('/eventos/:id/inscritos', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        error: 'ID inválido'
      });
    }

    const evento = await Evento.findById(req.params.id);

    if (!evento) {
      return res.status(404).json({
        error: 'Evento não encontrado'
      });
    }

    res.json({
      evento: evento.titulo,
      totalInscritos: evento.inscritos.length,
      inscritos: evento.inscritos
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Debug do banco
app.get('/debug', async (req, res) => {
  try {
    if (!mongoose.connection.db) {
      return res.status(500).json({
        error: 'Banco ainda não conectado'
      });
    }

    const collections = await mongoose.connection.db.listCollections().toArray();
    const totalEventos = await Evento.countDocuments();

    res.json({
      bancoConectado: mongoose.connection.name,
      collectionUsada: Evento.collection.name,
      totalEventos,
      collections: collections.map(c => c.name)
    });
  } catch (err) {
    res.status(500).json({
      error: err.message
    });
  }
});

// Iniciar servidor
async function iniciarServidor() {
  try {
    console.log('Tentando conectar ao MongoDB...');
    console.log('PORT:', process.env.PORT || 3000);
    console.log('URI existe?', !!process.env.MONGODB_URI);

    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI não encontrada no arquivo .env');
    }

    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: 'acadeventos',
      serverSelectionTimeoutMS: 10000,
      family: 4
    });

    console.log('Conectado ao MongoDB');
    console.log('Banco conectado:', mongoose.connection.name);
    console.log('Collection usada:', Evento.collection.name);

    app.listen(process.env.PORT || 3000, () => {
      console.log(`Servidor rodando em http://localhost:${process.env.PORT || 3000}`);
    });
  } catch (err) {
    console.log('Erro ao conectar no MongoDB:');
    console.log(err.message);
  }
}

iniciarServidor();