import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const TeacherActivityDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();

  useEffect(() => {
    navigate('/activities', {
      replace: true,
      state: { activityId: id },
    });
  }, [id, navigate]);

  return null;
};

export default TeacherActivityDetails;
