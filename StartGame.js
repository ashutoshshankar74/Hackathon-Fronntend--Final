import React, { useState, useEffect, useContext } from 'react';
import { Grid, Paper, TextField, Button, Typography, Radio, RadioGroup, FormControlLabel } from '@mui/material';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { io } from 'socket.io-client';
import { UserContext } from './UserContext';

const socket = io('http://localhost:8080');

const StartGame = () => {
  const { lobbyId } = useParams();
  const navigate = useNavigate();
  const { email } = useContext(UserContext);
  const [lobbyOwnerEmail, setLobbyOwnerEmail] = useState('');
  const [error, setError] = useState('');
  const [gameStarted, setGameStarted] = useState(false);
  const [mcq, setMcq] = useState({
    qid: null,
    qname: '',
    qoptions: [],
    qans: '',
  });
  const accessToken = localStorage.getItem(email);
  const [timerSeconds, setTimerSeconds] = useState(200);
  const [currentScore, setCurrentScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState('');
  const [waitingForQuiz, setWaitingForQuiz] = useState(false);
  const [winnerInfo, setWinnerInfo] = useState(null);
  const [gameId, setGameId] = useState(''); // New state for Game ID
  let timer;

  useEffect(() => {
    const fetchLobbyDetails = async () => {
      try {
        const response = await axios.get('http://localhost:8080/lobbies/listLobby', {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
        });
        const lobby = response.data.find(lobby => lobby.lid === lobbyId);
        if (lobby) {
          setLobbyOwnerEmail(lobby.lowneremail);
        } else {
          setError('Lobby not found');
        }
      } catch (error) {
        setError(error.response?.data?.message || 'Failed to fetch lobby details');
      }
    };
    fetchLobbyDetails();
    socket.emit('joinLobby', { lobbyId: lobbyId, participant: email });
    socket.on('firstMcq', (data) => {
      if (data.mcq != null) {
        setMcq({
          qid: data.mcq.qid,
          qname: data.mcq.qname,
          qoptions: data.mcq.qoptions,
          qans: data.mcq.qans,
        });
        setGameStarted(true);
        if (gameStarted) {
          startTimer();
        }
      } else {
        setMcq(null);
        setWaitingForQuiz(true);
      }
    });
    socket.on('newScoreAndMcq', (data) => {
      if (data.nextMcq != null) {
        setMcq({
          qid: data.nextMcq.qid,
          qname: data.nextMcq.qname,
          qoptions: data.nextMcq.qoptions,
          qans: data.nextMcq.qans,
        });
        setCurrentScore(data.newScore);
      } else {
        setCurrentScore(data.newScore);
        setMcq(null);
        setWaitingForQuiz(true);
      }
    });
    socket.on('winnerDeclared', (data) => {
      setWinnerInfo(data);
      setWaitingForQuiz(false);
      setMcq(null);
    });
    return () => {
      clearInterval(timer);
    };
  }, [lobbyId, email, accessToken, navigate, gameStarted]);

  useEffect(() => {
    if (gameStarted) {
      startTimer();
    }
  }, [gameStarted]);

  const startTimer = () => {
    timer = setInterval(() => {
      setTimerSeconds(prevSeconds => {
        const newSeconds = prevSeconds - 1;
        if (newSeconds <= 0) {
          clearInterval(timer);
          handleGetResult();
          return 0;
        }
        return newSeconds;
      });
    }, 1000);
  };

  const handleStartGame = async (event) => {
    event.preventDefault();
    if (email !== lobbyOwnerEmail) {
      alert('Only the lobby creator can start the game');
      return;
    }
    try {
      const response = await axios.post('http://localhost:8080/games/startGame', {
        gid: gameId, // Use the user-provided Game ID
        lid: lobbyId,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (response.status === 200) {
        socket.emit('gameStarted', { lobbyId: lobbyId, mcq: response.data.mcq });
        if (response.data.mcq != null) {
          setMcq({
            qid: response.data.mcq.qid,
            qname: response.data.mcq.qname,
            qoptions: response.data.mcq.qoptions,
            qans: response.data.mcq.qans,
          });
          setGameStarted(true);
          setTimerSeconds(200);
        } else {
          setMcq(null);
          setWaitingForQuiz(true);
        }
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to start game');
    }
  };

  const handleSubmitAnswer = async () => {
    try {
      const response = await axios.post('http://localhost:8080/games/submitAnswer', {
        gid: gameId, // Use the user-provided Game ID
        lid: lobbyId,
        userEmail: email,
        qid: mcq.qid,
        selectedOption: selectedOption,
        currentScore: currentScore,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (response.status === 200) {
        socket.emit('submissionReceived', { newScore: response.data.newScore, nextMcq: response.data.nextMCQ });
        if (response.data.nextMCQ != null) {
          setMcq({
            qid: response.data.nextMCQ.qid,
            qname: response.data.nextMCQ.qname,
            qoptions: response.data.nextMCQ.qoptions,
            qans: response.data.nextMCQ.qans,
          });
          setCurrentScore(response.data.newScore);
        } else {
          setCurrentScore(response.data.newScore);
          setMcq(null);
          setWaitingForQuiz(true);
        }
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to submit answer');
    }
  };

  const handleGetResult = async () => {
    try {
      const response = await axios.post('http://localhost:8080/games/getResult', {
        gid: gameId, // Use the user-provided Game ID
        lid: lobbyId,
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
      });
      if (response.status === 200) {
        socket.emit('gameFinished', { lobbyId: lobbyId, winnerName: response.data.winnerName, winnerScore: response.data.winnerScore });
        setWinnerInfo(response.data);
        setWaitingForQuiz(false);
        setMcq(null);
      }
    } catch (error) {
      setError(error.response?.data?.message || 'Failed to get game result');
    }
  };

  if (gameStarted && mcq) {
    return (
      <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '100vh' }}>
        <Paper elevation={10} style={{ padding: 20, width: 400 }}>
          <Typography variant="h5" align="center" gutterBottom>
            MCQ
          </Typography>
          <Typography variant="body1" align="center" gutterBottom>
            {mcq.qname}
          </Typography>
          <RadioGroup value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)}>
            {mcq.qoptions.map((option, index) => (
              <FormControlLabel
                key={index}
                value={option}
                control={<Radio />}
                label={option}
              />
            ))}
          </RadioGroup>
          <Button
            type="button"
            color="primary"
            variant="contained"
            fullWidth
            onClick={handleSubmitAnswer}
          >
            Submit Answer
          </Button>
        </Paper>
        <Paper elevation={10} style={{ padding: 20, width: 200, position: 'absolute', top: 20, left: 20 }}>
          <Typography variant="h6" gutterBottom>
            Your Score:
          </Typography>
          <Typography variant="h4" color="primary">
            {currentScore}
          </Typography>
        </Paper>
        <Paper elevation={10} style={{ padding: 20, width: 200, position: 'absolute', top: 20, right: 20 }}>
          <Typography variant="h6" gutterBottom>
            Quiz ends in:
          </Typography>
          <Typography variant="h4" color="primary">
            {timerSeconds} seconds
          </Typography>
        </Paper>
      </Grid>
    );
  } else if (gameStarted && waitingForQuiz) {
    return (
      <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '100vh' }}>
        <Paper elevation={10} style={{ padding: 20, width: 400 }}>
          <Typography variant="h5" align="center" gutterBottom>
            Waiting for quiz to finish...
          </Typography>
        </Paper>
        <Paper elevation={10} style={{ padding: 20, width: 200, position: 'absolute', top: 20, left: 20 }}>
          <Typography variant="h6" gutterBottom>
            Your Score:
          </Typography>
          <Typography variant="h4" color="primary">
            {currentScore}
          </Typography>
        </Paper>
        <Paper elevation={10} style={{ padding: 20, width: 200, position: 'absolute', top: 20, right: 20 }}>
          <Typography variant="h6" gutterBottom>
            Quiz ends in:
          </Typography>
          <Typography variant="h4" color="primary">
            {timerSeconds} seconds
          </Typography>
        </Paper>
      </Grid>
    );
  } else if (gameStarted && winnerInfo) {
    return (
      <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '100vh' }}>
        <Paper elevation={10} style={{ padding: 20, width: 400 }}>
          <Typography variant="h5" align="center" gutterBottom>
            Game Result
          </Typography>
          <Typography variant="h6" align="center">
            Winner: {winnerInfo.winnerName}
          </Typography>
          <Typography variant="h6" align="center">
            Score: {winnerInfo.winnerScore}
          </Typography>
        </Paper>
      </Grid>
    );
  } else {
    return (
      <Grid container justifyContent="center" alignItems="center" style={{ minHeight: '100vh' }}>
        <Paper elevation={10} style={{ padding: 20, width: 400 }}>
          <Typography variant="h5" align="center" gutterBottom>
            Start Game
          </Typography>
          {error && <Typography color="error" align="center">{error}</Typography>}
          <form onSubmit={handleStartGame}>
            <TextField
              label="Lobby ID"
              fullWidth
              required
              value={lobbyId}
              InputProps={{ readOnly: true }}
              style={{ marginBottom: 16 }}
            />
            <TextField
              label="Game ID"
              fullWidth
              required
              value={gameId}
              onChange={(e) => setGameId(e.target.value)} // Handle input change
              style={{ marginBottom: 16 }}
            />
            <TextField
              label="Email"
              fullWidth
              required
              value={email}
              InputProps={{ readOnly: true }}
              style={{ marginBottom: 16 }}
            />
            <Button
              type="submit"
              color="primary"
              variant="contained"
              fullWidth
            >
              Start Game
            </Button>
          </form>
        </Paper>
      </Grid>
    );
  }
};

export default StartGame;
