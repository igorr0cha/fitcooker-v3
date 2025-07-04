
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChefHat, Heart, Star, Users, BookOpen, TrendingUp, Award, Plus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useUserStats } from '@/hooks/useUserStats';
import { useRecipes } from '@/hooks/useRecipes';
import { supabase } from '@/integrations/supabase/client';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import RecipeCard from '@/components/ui/RecipeCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import SectionTitle from '@/components/ui/SectionTitle';

interface Chef {
  id: string;
  nome: string;
  avatar_url: string | null;
  receitas_count: number;
  seguidores_count: number;
  nota_media: number | null;
}

const Dashboard: React.FC = () => {
  const { user, profile } = useAuth();
  const { stats, loading: statsLoading, refetch: refetchStats } = useUserStats(user?.id);
  const { data: allRecipes, loading: recipesLoading } = useRecipes();
  const [featuredChefs, setFeaturedChefs] = useState<Chef[]>([]);
  const [userRecipes, setUserRecipes] = useState<any[]>([]);
  const [savedRecipes, setSavedRecipes] = useState<any[]>([]);
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    if (user) {
      checkIfNewUser();
      fetchFeaturedChefs();
      fetchUserRecipes();
      fetchSavedRecipes();
    }
  }, [user]);

  const checkIfNewUser = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('profiles')
        .select('data_cadastro')
        .eq('id', user.id)
        .single();

      if (data) {
        const cadastroDate = new Date(data.data_cadastro);
        const now = new Date();
        const diffHours = (now.getTime() - cadastroDate.getTime()) / (1000 * 60 * 60);
        setIsNewUser(diffHours < 24); // Consider new if registered in last 24h
      }
    } catch (error) {
      console.error('Error checking user registration date:', error);
    }
  };

  const fetchFeaturedChefs = async () => {
    try {
      // Get chefs with their average rating from their recipes
      const { data: chefsWithRatings } = await supabase
        .from('profiles')
        .select(`
          id,
          nome,
          avatar_url,
          receitas_count,
          seguidores_count,
          receitas!inner(nota_media)
        `)
        .eq('is_chef', true)
        .gt('receitas_count', 0);

      if (chefsWithRatings) {
        // Calculate average rating for each chef
        const chefsWithAvgRating = chefsWithRatings.map(chef => {
          const validRatings = chef.receitas
            .map((r: any) => r.nota_media)
            .filter((rating: number) => rating > 0);
          
          const avgRating = validRatings.length > 0 
            ? validRatings.reduce((sum: number, rating: number) => sum + rating, 0) / validRatings.length
            : 0;

          return {
            id: chef.id,
            nome: chef.nome,
            avatar_url: chef.avatar_url,
            receitas_count: chef.receitas_count,
            seguidores_count: chef.seguidores_count,
            nota_media: avgRating > 0 ? Number(avgRating.toFixed(1)) : null,
          };
        });

        // Sort by followers count and rating, then take top 4
        const sortedChefs = chefsWithAvgRating.sort((a, b) => {
          // First priority: rating (if available)
          if (a.nota_media && b.nota_media) {
            if (a.nota_media !== b.nota_media) {
              return b.nota_media - a.nota_media;
            }
          } else if (a.nota_media && !b.nota_media) {
            return -1;
          } else if (!a.nota_media && b.nota_media) {
            return 1;
          }
          
          // Second priority: followers count
          return b.seguidores_count - a.seguidores_count;
        }).slice(0, 4);

        setFeaturedChefs(sortedChefs);
      }
    } catch (error) {
      console.error('Error fetching featured chefs:', error);
    }
  };

  const fetchUserRecipes = async () => {
    if (!user) return;

    try {
      const { data } = await supabase
        .from('receitas')
        .select(`
          *,
          profiles(nome, avatar_url),
          receita_categorias(categorias(nome))
        `)
        .eq('usuario_id', user.id)
        .eq('status', 'ativa')
        .order('created_at', { ascending: false })
        .limit(4);

      if (data) {
        const transformedRecipes = data.map(recipe => ({
          id: recipe.id,
          titulo: recipe.titulo,
          title: recipe.titulo,
          descricao: recipe.descricao,
          description: recipe.descricao,
          imagem_url: recipe.imagem_url,
          imageUrl: recipe.imagem_url,
          tempo_preparo: recipe.tempo_preparo,
          preparationTime: recipe.tempo_preparo,
          porcoes: recipe.porcoes,
          servings: recipe.porcoes,
          dificuldade: recipe.dificuldade,
          difficulty: recipe.dificuldade,
          nota_media: recipe.nota_media,
          rating: recipe.nota_media,
          avaliacoes_count: recipe.avaliacoes_count,
          created_at: recipe.created_at,
          usuario_id: recipe.usuario_id,
          author: {
            id: recipe.profiles?.id || recipe.usuario_id,
            name: recipe.profiles?.nome || 'Chef Anônimo',
            avatarUrl: recipe.profiles?.avatar_url || '',
          },
          categories: recipe.receita_categorias?.map((rc: any) => rc.categorias?.nome).filter(Boolean) || [],
          macros: { calories: 0, protein: 0, carbs: 0, fat: 0 },
        }));
        setUserRecipes(transformedRecipes);
      }
    } catch (error) {
      console.error('Error fetching user recipes:', error);
    }
  };

  const fetchSavedRecipes = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('receitas_salvas')
        .select(`
          *,
          receitas(
            *,
            profiles(nome, avatar_url),
            receita_categorias(categorias(nome)),
            informacao_nutricional(*)
          )
        `)
        .eq('usuario_id', user.id)
        .order('created_at', { ascending: false })
        .limit(4);

      if (error) throw error;

      const transformedRecipes = data?.map(savedRecipe => {
        const recipe = savedRecipe.receitas;
        return {
          id: recipe.id,
          titulo: recipe.titulo,
          title: recipe.titulo,
          descricao: recipe.descricao,
          description: recipe.descricao,
          imagem_url: recipe.imagem_url,
          imageUrl: recipe.imagem_url,
          tempo_preparo: recipe.tempo_preparo,
          preparationTime: recipe.tempo_preparo,
          porcoes: recipe.porcoes,
          servings: recipe.porcoes,
          dificuldade: recipe.dificuldade,
          difficulty: recipe.dificuldade,
          nota_media: recipe.nota_media,
          rating: recipe.nota_media,
          avaliacoes_count: recipe.avaliacoes_count,
          created_at: recipe.created_at,
          usuario_id: recipe.usuario_id,
          author: {
            id: (recipe as any).profiles?.id || recipe.usuario_id,
            name: (recipe as any).profiles?.nome || 'Chef Anônimo',
            avatarUrl: (recipe as any).profiles?.avatar_url || '',
          },
          categories: (recipe as any).receita_categorias?.map((rc: any) => rc.categorias?.nome).filter(Boolean) || [],
          macros: recipe.informacao_nutricional?.[0] ? {
            calories: Math.round(recipe.informacao_nutricional[0].calorias_totais / recipe.porcoes),
            protein: Math.round(recipe.informacao_nutricional[0].proteinas_totais / recipe.porcoes),
            carbs: Math.round(recipe.informacao_nutricional[0].carboidratos_totais / recipe.porcoes),
            fat: Math.round(recipe.informacao_nutricional[0].gorduras_totais / recipe.porcoes),
          } : { calories: 0, protein: 0, carbs: 0, fat: 0 },
        };
      }) || [];

      setSavedRecipes(transformedRecipes);
    } catch (error) {
      console.error('Error fetching saved recipes:', error);
    }
  };

  if (statsLoading || recipesLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow flex items-center justify-center pt-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-fitcooker-orange mx-auto mb-4"></div>
            <p className="text-gray-600">Carregando seu dashboard...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const popularRecipes = allRecipes
    .filter(recipe => recipe.nota_media && recipe.nota_media > 4)
    .sort((a, b) => (b.nota_media || 0) - (a.nota_media || 0))
    .slice(0, 4);

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-orange-50/30">
      <Navbar />
      
      <main className="py-12 pt-32">
        <div className="container mx-auto px-4 md:px-6">
          {/* Welcome Section with Enhanced Title */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative mb-12"
          >
            <div className="text-center">
              <div className="relative inline-block mb-6">
                <div className="absolute inset-0 bg-gradient-to-r from-fitcooker-orange/30 via-orange-500/30 to-orange-600/30 blur-3xl rounded-full transform scale-150"></div>
                <h1 className="relative text-4xl md:text-6xl font-bold bg-gradient-to-r from-fitcooker-orange via-orange-500 to-orange-600 bg-clip-text text-transparent drop-shadow-2xl">
                  Bem-vindo, {profile?.nome || 'Chef'}!
                </h1>
              </div>
              
              {isNewUser && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-gradient-to-r from-fitcooker-orange to-orange-500 text-white rounded-2xl p-6 max-w-2xl mx-auto mb-8 shadow-xl"
                >
                  <div className="flex items-center justify-center space-x-3 mb-3">
                    <Award className="w-8 h-8" />
                    <span className="text-xl font-bold">Agora você é um Chef!</span>
                  </div>
                  <p className="text-orange-100">
                    Cozinhe, poste suas receitas favoritas ou simplesmente desfrute da nossa comunidade culinária. 
                    O mundo gastronômico está nas suas mãos! 🍳✨
                  </p>
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Stats Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12"
          >
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-blue-600 text-sm font-medium">Minhas Receitas</p>
                    <p className="text-3xl font-bold text-blue-800">{stats.receitas_count}</p>
                  </div>
                  <BookOpen className="w-8 h-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-green-600 text-sm font-medium">Seguidores</p>
                    <p className="text-3xl font-bold text-green-800">{stats.seguidores_count}</p>
                  </div>
                  <Users className="w-8 h-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 border-yellow-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-yellow-600 text-sm font-medium">Avaliações</p>
                    <p className="text-3xl font-bold text-yellow-800">{stats.avaliacoes_count}</p>
                  </div>
                  <Star className="w-8 h-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200 hover:shadow-lg transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-purple-600 text-sm font-medium">Nota Média</p>
                    <p className="text-3xl font-bold text-purple-800">
                      {stats.nota_media ? `${stats.nota_media}⭐` : 'N/A'}
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* My Recent Recipes */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
            >
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <ChefHat className="w-5 h-5 text-fitcooker-orange" />
                        <span>Minhas Receitas Recentes</span>
                      </CardTitle>
                      <CardDescription>Suas últimas criações culinárias</CardDescription>
                    </div>
                    <Button asChild size="sm" className="bg-fitcooker-orange hover:bg-fitcooker-orange/90">
                      <a href="/add-recipe">
                        <Plus className="w-4 h-4 mr-2" />
                        Nova
                      </a>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {userRecipes.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {userRecipes.map((recipe) => (
                        <div key={recipe.id} className="transform hover:scale-105 transition-transform">
                          <RecipeCard recipe={recipe} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <ChefHat className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                      <p className="text-gray-500 mb-4">Você ainda não criou nenhuma receita</p>
                      <Button asChild className="bg-fitcooker-orange hover:bg-fitcooker-orange/90">
                        <a href="/add-recipe">Criar Primeira Receita</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Right Column */}
            <div className="space-y-8">
              {/* Featured Chefs */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Award className="w-5 h-5 text-fitcooker-orange" />
                      <span>Chefs em Destaque</span>
                    </CardTitle>
                    <CardDescription>Conheça os chefs mais seguidos</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {featuredChefs.map((chef) => (
                        <div key={chef.id} className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => window.location.href = `/cook/${chef.id}`}>
                          <Avatar className="w-12 h-12">
                            <AvatarImage src={chef.avatar_url || ''} />
                            <AvatarFallback className="bg-fitcooker-orange text-white">
                              <ChefHat className="w-6 h-6" />
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{chef.nome}</p>
                            <div className="flex items-center space-x-4 text-sm text-gray-500">
                              <span>{chef.receitas_count} receitas</span>
                              <span>{chef.seguidores_count} seguidores</span>
                              {chef.nota_media && (
                                <span className="flex items-center">
                                  <Star className="w-3 h-3 text-yellow-500 mr-1" />
                                  {chef.nota_media}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* My Favorite Recipes */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.4 }}
              >
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2">
                      <Heart className="w-5 h-5 text-fitcooker-orange" />
                      <span>Minhas Receitas Favoritas</span>
                    </CardTitle>
                    <CardDescription>Suas receitas salvas</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {savedRecipes.length > 0 ? (
                      <div className="space-y-4">
                        {savedRecipes.map((recipe) => (
                          <div 
                            key={recipe.id} 
                            className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => window.location.href = `/recipe/${recipe.id}`}
                          >
                            <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-100">
                              {recipe.imagem_url ? (
                                <img 
                                  src={recipe.imagem_url} 
                                  alt={recipe.titulo}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <ChefHat className="w-6 h-6 text-gray-400" />
                                </div>
                              )}
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-gray-900 line-clamp-1">{recipe.titulo}</p>
                              <p className="text-sm text-gray-500">por {recipe.author.name}</p>
                              <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1">
                                <span>{recipe.tempo_preparo} min</span>
                                <span>•</span>
                                <span>{recipe.porcoes} porções</span>
                                {recipe.nota_media && (
                                  <>
                                    <span>•</span>
                                    <span className="flex items-center">
                                      <Star className="w-3 h-3 text-yellow-500 mr-1" />
                                      {recipe.nota_media}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Heart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                        <p className="text-gray-500 text-sm mb-3">Você ainda não salvou nenhuma receita</p>
                        <Button asChild size="sm" variant="outline">
                          <a href="/recipes">Explorar Receitas</a>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>

          {/* Popular Recipes */}
          {popularRecipes.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-12"
            >
              <SectionTitle 
                title="Receitas Populares"
                subtitle="As receitas mais bem avaliadas da nossa comunidade"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {popularRecipes.map((recipe, index) => (
                  <motion.div
                    key={recipe.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 + 0.1 * index }}
                  >
                    <RecipeCard recipe={recipe} />
                  </motion.div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Dashboard;
